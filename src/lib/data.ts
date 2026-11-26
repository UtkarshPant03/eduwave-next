/**
 * Read queries. Each function either takes an id the caller has already
 * authorised (via the DAL) or checks ownership itself. None returns password hashes.
 *
 * Contrast with the original API, where GET /api/get-students returned every
 * student's full record, hash included, to anyone.
 */
import "server-only";
import { notFound } from "next/navigation";
import { and, asc, avg, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { finalizeIfExpired } from "./quiz-engine";

const { users, classes, quizzes, questions, attempts, answers, resources, tasks } = schema;

// Percentage of one submitted attempt, as SQL, for aggregation.
const attemptPercent = sql<number>`(${attempts.score}::float / nullif(${attempts.total}, 0)) * 100`;

/* ----------------------------- shared ----------------------------- */

export function listTasks(userId: string) {
  return db
    .select({ id: tasks.id, text: tasks.text, done: tasks.done })
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(asc(tasks.done), desc(tasks.createdAt));
}

export function listResources(classId: string) {
  return db
    .select()
    .from(resources)
    .where(eq(resources.classId, classId))
    .orderBy(desc(resources.createdAt));
}

/** Leaderboard: only names and aggregate scores leave the database. */
export async function classLeaderboard(classId: string) {
  const rows = await db
    .select({
      studentId: users.id,
      name: users.name,
      quizzesTaken: count(attempts.id),
      averagePercent: avg(attemptPercent).mapWith(Number),
      totalScore: sql<number>`coalesce(sum(${attempts.score}), 0)`.mapWith(Number),
    })
    .from(users)
    .innerJoin(attempts, and(eq(attempts.studentId, users.id), isNotNull(attempts.submittedAt)))
    .where(and(eq(users.classId, classId), eq(users.role, "student")))
    .groupBy(users.id, users.name)
    .orderBy(desc(avg(attemptPercent)), desc(sql`sum(${attempts.score})`));
  return rows;
}

/* ----------------------------- teacher ----------------------------- */

export function listTeacherClasses(teacherId: string) {
  return db
    .select({
      id: classes.id,
      name: classes.name,
      studentCount: sql<number>`(select count(*) from ${users} where ${users.classId} = ${classes.id})`.mapWith(Number),
      quizCount: sql<number>`(select count(*) from ${quizzes} where ${quizzes.classId} = ${classes.id})`.mapWith(Number),
    })
    .from(classes)
    .where(eq(classes.teacherId, teacherId))
    .orderBy(asc(classes.name));
}

/** 404s unless the class belongs to this teacher. */
export async function getTeacherClass(teacherId: string, classId: string) {
  const klass = await db.query.classes.findFirst({
    where: (c, { and, eq }) => and(eq(c.id, classId), eq(c.teacherId, teacherId)),
  });
  if (!klass) notFound();
  return klass;
}

export function listClassStudents(classId: string) {
  return db
    .select({ id: users.id, name: users.name, rollNumber: users.rollNumber })
    .from(users)
    .where(and(eq(users.classId, classId), eq(users.role, "student")))
    .orderBy(asc(users.rollNumber));
}

export function listClassQuizzes(classId: string) {
  return db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      subject: quizzes.subject,
      deadline: quizzes.deadline,
      timeLimitMinutes: quizzes.timeLimitMinutes,
      submissions: sql<number>`(select count(*) from ${attempts} where ${attempts.quizId} = ${quizzes.id} and ${attempts.submittedAt} is not null)`.mapWith(Number),
    })
    .from(quizzes)
    .where(eq(quizzes.classId, classId))
    .orderBy(desc(quizzes.deadline));
}

export async function getQuizAnalytics(teacherId: string, quizId: string) {
  const [row] = await db
    .select({ quiz: quizzes, className: classes.name })
    .from(quizzes)
    .innerJoin(classes, eq(quizzes.classId, classes.id))
    .where(and(eq(quizzes.id, quizId), eq(classes.teacherId, teacherId)));
  if (!row) notFound();

  const questionStats = await db
    .select({
      id: questions.id,
      position: questions.position,
      prompt: questions.prompt,
      options: questions.options,
      correctIndex: questions.correctIndex,
      answered: count(answers.attemptId),
      correct: sql<number>`count(*) filter (where ${answers.selectedIndex} = ${questions.correctIndex})`.mapWith(Number),
    })
    .from(questions)
    .leftJoin(answers, eq(answers.questionId, questions.id))
    .where(eq(questions.quizId, quizId))
    .groupBy(questions.id)
    .orderBy(asc(questions.position));

  const results = await db
    .select({
      name: users.name,
      rollNumber: users.rollNumber,
      score: attempts.score,
      total: attempts.total,
      startedAt: attempts.startedAt,
      submittedAt: attempts.submittedAt,
    })
    .from(attempts)
    .innerJoin(users, eq(attempts.studentId, users.id))
    .where(eq(attempts.quizId, quizId))
    .orderBy(desc(attempts.score));

  const classSize = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.classId, row.quiz.classId), eq(users.role, "student")));

  return { quiz: row.quiz, className: row.className, questionStats, results, classSize: classSize[0].n };
}

/* ----------------------------- student ----------------------------- */

export function listStudentQuizzes(studentId: string, classId: string) {
  return db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      subject: quizzes.subject,
      deadline: quizzes.deadline,
      timeLimitMinutes: quizzes.timeLimitMinutes,
      startedAt: attempts.startedAt,
      submittedAt: attempts.submittedAt,
      score: attempts.score,
      total: attempts.total,
    })
    .from(quizzes)
    .leftJoin(attempts, and(eq(attempts.quizId, quizzes.id), eq(attempts.studentId, studentId)))
    .where(eq(quizzes.classId, classId))
    .orderBy(desc(quizzes.deadline));
}

/**
 * Everything the quiz page needs for one student. Correct answers are only
 * included after the student has submitted AND the deadline has passed, so
 * finished students can't share the answer key with classmates still working.
 */
export async function getStudentQuiz(student: { id: string; classId: string }, quizId: string) {
  const quiz = await db.query.quizzes.findFirst({
    where: (q, { and, eq }) => and(eq(q.id, quizId), eq(q.classId, student.classId)),
  });
  if (!quiz) notFound();

  let attempt = await db.query.attempts.findFirst({
    where: (a, { and, eq }) => and(eq(a.quizId, quizId), eq(a.studentId, student.id)),
  });
  if (attempt && (await finalizeIfExpired(attempt, quiz))) {
    attempt = await db.query.attempts.findFirst({ where: (a, { eq }) => eq(a.id, attempt!.id) });
  }

  const revealAnswers = Boolean(attempt?.submittedAt) && quiz.deadline.getTime() < Date.now();
  const questionRows = await db.query.questions.findMany({
    where: (q, { eq }) => eq(q.quizId, quizId),
    orderBy: (q, { asc }) => asc(q.position),
  });
  const saved = attempt
    ? await db.query.answers.findMany({ where: (a, { eq }) => eq(a.attemptId, attempt!.id) })
    : [];
  const selectedByQuestion = new Map(saved.map((a) => [a.questionId, a.selectedIndex]));

  return {
    quiz,
    attempt: attempt ?? null,
    revealAnswers,
    questions: questionRows.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      options: q.options,
      selectedIndex: selectedByQuestion.get(q.id) ?? null,
      // Explicitly null unless revealed: the answer key never reaches the browser early.
      correctIndex: revealAnswers ? q.correctIndex : null,
    })),
  };
}

export async function studentStats(studentId: string) {
  const bySubject = await db
    .select({
      subject: quizzes.subject,
      quizzesTaken: count(attempts.id),
      averagePercent: avg(attemptPercent).mapWith(Number),
    })
    .from(attempts)
    .innerJoin(quizzes, eq(attempts.quizId, quizzes.id))
    .where(and(eq(attempts.studentId, studentId), isNotNull(attempts.submittedAt)))
    .groupBy(quizzes.subject)
    .orderBy(asc(quizzes.subject));

  const history = await db
    .select({
      title: quizzes.title,
      subject: quizzes.subject,
      score: attempts.score,
      total: attempts.total,
      submittedAt: attempts.submittedAt,
    })
    .from(attempts)
    .innerJoin(quizzes, eq(attempts.quizId, quizzes.id))
    .where(and(eq(attempts.studentId, studentId), isNotNull(attempts.submittedAt)))
    .orderBy(desc(attempts.submittedAt));

  return { bySubject, history };
}
