/**
 * Quizzes and assignments: student views (with answer-key protection) and
 * instructor views (analytics, grading queues). Callers pass an authorised user.
 */
import "server-only";
import { notFound } from "next/navigation";
import { and, asc, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CurrentUser } from "@/lib/auth/dal";
import { courseForInstructor, courseForStudent } from "@/lib/access";
import { gradedResult, isCorrect, normalizeShortAnswer } from "@/lib/questions";
import { finalizeExpiredAttempts, finalizeIfExpired, givenQuestionIds, GRACE_MS } from "@/lib/quiz-engine";
import { staffOf } from "./sql";

const { users, questions, attempts, answers, assignments, submissions, files, enrollments } = schema;

/* =============================== quizzes =============================== */

/** Number of questions an attempt is given: fixed questions + each random slot's picks. */
async function questionsPerAttempt(quizId: string) {
  const [fixed, slots] = await Promise.all([
    db.$count(questions, and(eq(questions.quizId, quizId), isNull(questions.slotId))),
    db.select({ n: sql<number>`coalesce(sum(${schema.quizSlots.pickCount}), 0)`.mapWith(Number) }).from(schema.quizSlots).where(eq(schema.quizSlots.quizId, quizId)),
  ]);
  return fixed + (slots[0]?.n ?? 0);
}

/** A student's response, translated into THIS attempt's display order. */
export type StudentResponse = { selectedIndex: number | null; selectedIndexes: number[] | null; text: string | null; number: number | null };

/**
 * Everything the quiz page needs for one student, in THIS student's shuffled order.
 * Option indexes are display positions. Answer keys (correct options, accepted answers,
 * numerical values and tolerances) are only included after the student has submitted the
 * attempt shown AND the deadline has passed, so the key can't be shared early.
 *
 * `attemptNumber` picks a finished attempt to review; by default the open attempt (if any)
 * or else the latest finished one is shown.
 */
export async function getStudentQuiz(user: CurrentUser, quizId: string, attemptNumber?: number) {
  const quiz = await db.query.quizzes.findFirst({ where: (q, { eq }) => eq(q.id, quizId) });
  if (!quiz) notFound();
  const course = await courseForStudent(user, quiz.courseId);

  const load = () => db.query.attempts.findMany({ where: (a, { and, eq }) => and(eq(a.quizId, quizId), eq(a.studentId, user.id)), orderBy: (a, { asc }) => asc(a.attemptNumber) });
  let mine = await load();
  const open = mine.find((a) => !a.submittedAt);
  if (open && (await finalizeIfExpired(open, quiz))) mine = await load();

  const current = mine.find((a) => !a.submittedAt) ?? null;
  const finished = mine.filter((a) => a.submittedAt);
  const attempt = current ?? (attemptNumber ? finished.find((a) => a.attemptNumber === attemptNumber) : undefined) ?? finished.at(-1) ?? null;
  const graded = gradedResult(finished.map((a) => ({ attemptNumber: a.attemptNumber, score: a.score ?? 0, total: a.total })), quiz.gradingMethod);

  const now = Date.now();
  const notOpenYet = quiz.opensAt != null && quiz.opensAt.getTime() > now;
  const canStart = !current && finished.length < quiz.maxAttempts && quiz.deadline.getTime() > now && !notOpenYet;

  // Reveal only after the deadline AND the grace period: otherwise a student who has
  // finished could pass the key to someone still saving their last answers.
  const revealAnswers = Boolean(attempt?.submittedAt) && quiz.deadline.getTime() + GRACE_MS < now;
  const questionRows = await db.query.questions.findMany({
    where: (q, { eq }) => eq(q.quizId, quizId),
    orderBy: (q, { asc }) => asc(q.position),
  });
  const saved = attempt ? await db.query.answers.findMany({ where: (a, { eq }) => eq(a.attemptId, attempt.id) }) : [];
  const savedBy = new Map(saved.map((a) => [a.questionId, a]));

  const layout = attempt?.layout;
  const byId = new Map(questionRows.map((q) => [q.id, q]));
  const ordered = attempt ? givenQuestionIds(layout, questionRows).map((id) => byId.get(id)!).filter(Boolean) : [];

  return {
    course,
    quiz,
    attempt,
    attempts: mine.map((a) => ({ id: a.id, attemptNumber: a.attemptNumber, score: a.score, total: a.total, startedAt: a.startedAt, submittedAt: a.submittedAt })),
    graded,
    canStart,
    notOpenYet,
    questionCount: await questionsPerAttempt(quiz.id),
    revealAnswers,
    questions: ordered.map((q) => {
      const order = layout?.optionOrders[q.id] ?? q.options.map((_, i) => i); // display -> original
      const toDisplay = (orig: number) => order.indexOf(orig);
      const s = savedBy.get(q.id);
      const response: StudentResponse = {
        selectedIndex: s?.selectedIndex == null ? null : toDisplay(s.selectedIndex),
        selectedIndexes: s?.selectedIndexes ? s.selectedIndexes.map(toDisplay).sort((a, b) => a - b) : null,
        text: s?.textAnswer ?? null,
        number: s?.numberAnswer ?? null,
      };
      return {
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        points: q.points,
        options: order.map((orig) => q.options[orig]),
        response,
        // Explicitly null unless revealed: the answer key never reaches the browser early.
        key: revealAnswers
          ? {
              correct: isCorrect(q, s ? { selectedIndex: s.selectedIndex, selectedIndexes: s.selectedIndexes, textAnswer: s.textAnswer, numberAnswer: s.numberAnswer } : null),
              correctIndex: q.correctIndex == null ? null : toDisplay(q.correctIndex),
              correctIndexes: q.correctIndexes ? q.correctIndexes.map(toDisplay).sort((a, b) => a - b) : null,
              acceptedAnswers: q.acceptedAnswers,
              numericAnswer: q.numericAnswer,
              tolerance: q.tolerance,
              explanation: q.explanation,
            }
          : null,
      };
    }),
  };
}

export type StudentQuizQuestion = Awaited<ReturnType<typeof getStudentQuiz>>["questions"][number];

/**
 * Instructor analytics. Results are per student and use the quiz's grading method (the
 * same value as the gradebook); question statistics count every finished attempt.
 */
export async function getQuizAnalytics(user: CurrentUser, quizId: string) {
  const quiz = await db.query.quizzes.findFirst({ where: (q, { eq }) => eq(q.id, quizId) });
  if (!quiz) notFound();
  const course = await courseForInstructor(user, quiz.courseId, "grade.view");
  await finalizeExpiredAttempts({ quizId: quiz.id });

  const [questionRows, slots, attemptRows, answerRows] = await Promise.all([
    db.select().from(questions).where(eq(questions.quizId, quizId)).orderBy(asc(questions.position), asc(questions.id)),
    db.select().from(schema.quizSlots).where(eq(schema.quizSlots.quizId, quizId)).orderBy(asc(schema.quizSlots.position)),
    db
      .select({
        studentUserId: attempts.studentId,
        name: users.name,
        studentId: users.studentId,
        attemptNumber: attempts.attemptNumber,
        score: attempts.score,
        total: attempts.total,
        startedAt: attempts.startedAt,
        submittedAt: attempts.submittedAt,
      })
      .from(attempts)
      .innerJoin(users, eq(attempts.studentId, users.id))
      .where(eq(attempts.quizId, quizId))
      .orderBy(asc(users.name), asc(attempts.attemptNumber)),
    db
      .select({ questionId: answers.questionId, selectedIndex: answers.selectedIndex, selectedIndexes: answers.selectedIndexes, textAnswer: answers.textAnswer, numberAnswer: answers.numberAnswer })
      .from(answers)
      .innerJoin(attempts, eq(attempts.id, answers.attemptId))
      .where(and(eq(answers.quizId, quizId), isNotNull(attempts.submittedAt))),
  ]);

  // Per student: every attempt, plus the value that counts under the grading method.
  const byStudent = new Map<string, typeof attemptRows>();
  for (const a of attemptRows) byStudent.set(a.studentUserId, [...(byStudent.get(a.studentUserId) ?? []), a]);
  const results = [...byStudent.values()].map((list) => {
    const done = list.filter((a) => a.submittedAt);
    const graded = gradedResult(done.map((a) => ({ attemptNumber: a.attemptNumber, score: a.score ?? 0, total: a.total })), quiz.gradingMethod);
    const last = list[list.length - 1];
    return {
      name: last.name,
      studentId: last.studentId,
      attempts: list,
      finishedCount: done.length,
      inProgress: list.some((a) => !a.submittedAt),
      score: graded?.score ?? null,
      total: graded?.total ?? last.total,
      // Time of the latest finished attempt (for the duration column).
      startedAt: (done.at(-1) ?? last).startedAt,
      submittedAt: done.at(-1)?.submittedAt ?? null,
    };
  });
  results.sort((a, b) => (b.score ?? -1) / Math.max(b.total, 1) - (a.score ?? -1) / Math.max(a.total, 1));

  const answersBy = new Map<string, typeof answerRows>();
  for (const a of answerRows) answersBy.set(a.questionId, [...(answersBy.get(a.questionId) ?? []), a]);
  const slotName = new Map(slots.map((s) => [s.id, s.categoryName]));
  const questionStats = questionRows.map((q) => {
    const given = answersBy.get(q.id) ?? [];
    const correct = given.filter((a) => isCorrect(q, a)).length;
    const optionCounts = q.options.map((_, i) => given.filter((a) => a.selectedIndex === i || (a.selectedIndexes ?? []).includes(i)).length);
    // Most common typed answers (short answer / numerical), to spot misconceptions.
    const typed = new Map<string, number>();
    for (const a of given) {
      const v = a.textAnswer != null ? normalizeShortAnswer(a.textAnswer) : a.numberAnswer != null ? String(a.numberAnswer) : null;
      if (v != null) typed.set(v, (typed.get(v) ?? 0) + 1);
    }
    return {
      id: q.id,
      type: q.type,
      position: q.position,
      prompt: q.prompt,
      points: q.points,
      options: q.options,
      correctIndex: q.correctIndex,
      correctIndexes: q.correctIndexes,
      acceptedAnswers: q.acceptedAnswers,
      numericAnswer: q.numericAnswer,
      tolerance: q.tolerance,
      pool: q.slotId ? (slotName.get(q.slotId) ?? "Random") : null,
      answered: given.length,
      correct,
      optionCounts,
      topTyped: [...typed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  });

  const [{ n: classSize }] = await db.select({ n: count() }).from(enrollments).where(eq(enrollments.courseId, quiz.courseId));

  return { course, quiz, slots, questionStats, results, classSize, questionCount: await questionsPerAttempt(quiz.id) };
}

/* ============================= assignments ============================= */

export async function getAssignmentForStudent(user: CurrentUser, assignmentId: string) {
  const assignment = await db.query.assignments.findFirst({ where: (a, { eq }) => eq(a.id, assignmentId) });
  if (!assignment) notFound();
  const course = await courseForStudent(user, assignment.courseId);
  const [row] = await db
    .select({ s: submissions, fileName: files.name, fileSize: files.size })
    .from(submissions)
    .leftJoin(files, eq(files.id, submissions.fileId))
    .where(and(eq(submissions.assignmentId, assignmentId), eq(submissions.studentId, user.id)));
  return { course, assignment, submission: row ? { ...row.s, fileName: row.fileName, fileSize: row.fileSize } : null };
}

/** Grading view: every enrolled student with their submission (if any). */
export async function getAssignmentForInstructor(user: CurrentUser, assignmentId: string) {
  const assignment = await db.query.assignments.findFirst({ where: (a, { eq }) => eq(a.id, assignmentId) });
  if (!assignment) notFound();
  const course = await courseForInstructor(user, assignment.courseId, "grade.edit");
  const rows = await db
    .select({
      studentId: users.id,
      name: users.name,
      universityId: users.studentId,
      submissionId: submissions.id,
      text: submissions.text,
      fileId: submissions.fileId,
      fileName: files.name,
      submittedAt: submissions.submittedAt,
      grade: submissions.grade,
      feedback: submissions.feedback,
      gradedAt: submissions.gradedAt,
    })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.userId))
    .leftJoin(submissions, and(eq(submissions.studentId, users.id), eq(submissions.assignmentId, assignmentId)))
    .leftJoin(files, eq(files.id, submissions.fileId))
    .where(eq(enrollments.courseId, assignment.courseId))
    .orderBy(sql`${submissions.submittedAt} is null`, asc(users.name));
  return { course, assignment, rows };
}

/** Ungraded submissions across an instructor's courses (the "to grade" queue). */
export function gradingQueue(instructorId: string, limit = 8) {
  return db
    .select({
      assignmentId: assignments.id,
      title: assignments.title,
      courseCode: schema.courses.code,
      student: users.name,
      submittedAt: submissions.submittedAt,
      late: sql<boolean>`${submissions.submittedAt} > ${assignments.dueAt}`,
    })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .innerJoin(schema.courses, eq(schema.courses.id, assignments.courseId))
    .innerJoin(users, eq(users.id, submissions.studentId))
    .where(and(staffOf(instructorId), isNull(submissions.grade)))
    .orderBy(asc(submissions.submittedAt))
    .limit(limit);
}

/* ================================ editing ================================ */

/** An assignment plus what limits editing it (the highest grade already given). */
export async function getAssignmentForEdit(user: CurrentUser, assignmentId: string) {
  const assignment = await db.query.assignments.findFirst({ where: (a, { eq }) => eq(a.id, assignmentId) });
  if (!assignment) notFound();
  const course = await courseForInstructor(user, assignment.courseId);
  const [{ topGrade, submitted }] = await db
    .select({ topGrade: sql<string | null>`max(${submissions.grade})`, submitted: count() })
    .from(submissions)
    .where(eq(submissions.assignmentId, assignment.id));
  return { course, assignment, topGrade: topGrade == null ? null : Number(topGrade), submitted };
}

/**
 * A quiz with its fixed questions and random slots (answer key included: instructors
 * only), how many students have started, and the highest attempt number used.
 */
export async function getQuizForEdit(user: CurrentUser, quizId: string) {
  const quiz = await db.query.quizzes.findFirst({ where: (q, { eq }) => eq(q.id, quizId) });
  if (!quiz) notFound();
  const course = await courseForInstructor(user, quiz.courseId);
  const [qs, slots, [{ started, used }]] = await Promise.all([
    db.select().from(questions).where(and(eq(questions.quizId, quiz.id), isNull(questions.slotId))).orderBy(asc(questions.position)),
    db.select().from(schema.quizSlots).where(eq(schema.quizSlots.quizId, quiz.id)).orderBy(asc(schema.quizSlots.position)),
    db
      .select({ started: sql<number>`count(distinct ${attempts.studentId})`.mapWith(Number), used: sql<number>`coalesce(max(${attempts.attemptNumber}), 0)`.mapWith(Number) })
      .from(attempts)
      .where(eq(attempts.quizId, quiz.id)),
  ]);
  return { course, quiz, questions: qs, slots, attemptCount: started, attemptsUsed: used, questionCount: await questionsPerAttempt(quiz.id) };
}
