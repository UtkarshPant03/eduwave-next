/**
 * Quizzes and assignments: student views (with answer-key protection) and
 * instructor views (analytics, grading queues). Callers pass an authorised user.
 */
import "server-only";
import { notFound } from "next/navigation";
import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CurrentUser } from "@/lib/auth/dal";
import { courseForInstructor, courseForStudent } from "@/lib/access";
import { finalizeIfExpired } from "@/lib/quiz-engine";

const { users, questions, attempts, answers, assignments, submissions, files, enrollments } = schema;

/* =============================== quizzes =============================== */

/**
 * Everything the quiz page needs for one student, in THIS student's shuffled order.
 * Option indexes are display positions. Correct answers are only included after the
 * student has submitted AND the deadline has passed, so the key can't be shared early.
 */
export async function getStudentQuiz(user: CurrentUser, quizId: string) {
  const quiz = await db.query.quizzes.findFirst({ where: (q, { eq }) => eq(q.id, quizId) });
  if (!quiz) notFound();
  const course = await courseForStudent(user, quiz.courseId);

  let attempt = await db.query.attempts.findFirst({
    where: (a, { and, eq }) => and(eq(a.quizId, quizId), eq(a.studentId, user.id)),
  });
  if (attempt && (await finalizeIfExpired(attempt, quiz))) {
    attempt = await db.query.attempts.findFirst({ where: (a, { eq }) => eq(a.id, attempt!.id) });
  }

  const revealAnswers = Boolean(attempt?.submittedAt) && quiz.deadline.getTime() < Date.now();
  const questionRows = await db.query.questions.findMany({
    where: (q, { eq }) => eq(q.quizId, quizId),
    orderBy: (q, { asc }) => asc(q.position),
  });
  const saved = attempt ? await db.query.answers.findMany({ where: (a, { eq }) => eq(a.attemptId, attempt!.id) }) : [];
  const selectedByQuestion = new Map(saved.map((a) => [a.questionId, a.selectedIndex]));

  const layout = attempt?.layout;
  const byId = new Map(questionRows.map((q) => [q.id, q]));
  const ordered = layout ? layout.questionOrder.map((id) => byId.get(id)!).filter(Boolean) : questionRows;

  return {
    course,
    quiz,
    attempt: attempt ?? null,
    revealAnswers,
    questions: ordered.map((q) => {
      const order = layout?.optionOrders[q.id] ?? q.options.map((_, i) => i); // display -> original
      const selected = selectedByQuestion.get(q.id);
      return {
        id: q.id,
        prompt: q.prompt,
        options: order.map((orig) => q.options[orig]),
        selectedIndex: selected == null ? null : order.indexOf(selected),
        // Explicitly null unless revealed: the answer key never reaches the browser early.
        correctIndex: revealAnswers ? order.indexOf(q.correctIndex) : null,
        explanation: revealAnswers ? q.explanation : null,
      };
    }),
  };
}

export async function getQuizAnalytics(user: CurrentUser, quizId: string) {
  const quiz = await db.query.quizzes.findFirst({ where: (q, { eq }) => eq(q.id, quizId) });
  if (!quiz) notFound();
  const course = await courseForInstructor(user, quiz.courseId);

  const questionStats = await db
    .select({
      id: questions.id,
      position: questions.position,
      prompt: questions.prompt,
      options: questions.options,
      correctIndex: questions.correctIndex,
      answered: count(answers.attemptId),
      correct: sql<number>`count(*) filter (where ${answers.selectedIndex} = ${questions.correctIndex})`.mapWith(Number),
      picks: sql<number[]>`coalesce(array_agg(${answers.selectedIndex}) filter (where ${answers.selectedIndex} is not null), '{}')`,
    })
    .from(questions)
    .leftJoin(answers, eq(answers.questionId, questions.id))
    .where(eq(questions.quizId, quizId))
    .groupBy(questions.id)
    .orderBy(asc(questions.position));

  const results = await db
    .select({
      name: users.name,
      studentId: users.studentId,
      score: attempts.score,
      total: attempts.total,
      startedAt: attempts.startedAt,
      submittedAt: attempts.submittedAt,
    })
    .from(attempts)
    .innerJoin(users, eq(attempts.studentId, users.id))
    .where(eq(attempts.quizId, quizId))
    .orderBy(desc(attempts.score));

  const [{ n: classSize }] = await db.select({ n: count() }).from(enrollments).where(eq(enrollments.courseId, quiz.courseId));

  return {
    course,
    quiz,
    questionStats: questionStats.map((q) => ({ ...q, optionCounts: q.options.map((_, i) => q.picks.filter((p) => p === i).length) })),
    results,
    classSize,
  };
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
  const course = await courseForInstructor(user, assignment.courseId);
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
    .where(and(eq(schema.courses.instructorId, instructorId), isNull(submissions.grade)))
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

/** A quiz with its questions (answer key included: instructors only) and its attempt count. */
export async function getQuizForEdit(user: CurrentUser, quizId: string) {
  const quiz = await db.query.quizzes.findFirst({ where: (q, { eq }) => eq(q.id, quizId) });
  if (!quiz) notFound();
  const course = await courseForInstructor(user, quiz.courseId);
  const qs = await db.select().from(questions).where(eq(questions.quizId, quiz.id)).orderBy(asc(questions.position));
  const attemptCount = await db.$count(attempts, eq(attempts.quizId, quiz.id));
  return { course, quiz, questions: qs, attemptCount };
}
