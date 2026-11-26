/**
 * Read queries. Each function either takes an id the caller has already
 * authorised (via the DAL) or checks ownership itself. None returns password hashes.
 *
 * Contrast with the original API, where GET /api/get-students returned every
 * student's full record, hash included, to anyone.
 */
import "server-only";
import { notFound } from "next/navigation";
import { and, asc, avg, count, desc, eq, gt, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { finalizeIfExpired } from "./quiz-engine";

const { users, classes, quizzes, questions, attempts, answers, resources, files, tasks, notifications, liveSessions, boards, auditLog } =
  schema;

// Percentage of one submitted attempt, as SQL, for aggregation.
const attemptPercent = sql<number>`(${attempts.score}::float / nullif(${attempts.total}, 0)) * 100`;

/* ----------------------------- shared ----------------------------- */

export function listTasks(userId: string) {
  return db
    .select({ id: tasks.id, text: tasks.text, done: tasks.done, dueDate: tasks.dueDate })
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(asc(tasks.done), sql`${tasks.dueDate} asc nulls last`, desc(tasks.createdAt));
}

export function listResources(classId: string) {
  return db
    .select({
      id: resources.id,
      title: resources.title,
      subject: resources.subject,
      url: resources.url,
      fileId: resources.fileId,
      fileName: files.name,
      fileSize: files.size,
      mimeType: files.mimeType,
      createdAt: resources.createdAt,
    })
    .from(resources)
    .leftJoin(files, eq(resources.fileId, files.id))
    .where(eq(resources.classId, classId))
    .orderBy(desc(resources.createdAt));
}

/** A file may be downloaded by its class's teacher or by students of that class. */
export async function getFileForUser(user: { id: string; role: string; classId: string | null }, fileId: string) {
  const [row] = await db
    .select({ file: files, teacherId: classes.teacherId })
    .from(files)
    .innerJoin(classes, eq(files.classId, classes.id))
    .where(eq(files.id, fileId));
  if (!row) return null;
  const allowed = user.role === "teacher" ? row.teacherId === user.id : user.classId === row.file.classId;
  return allowed ? row.file : null;
}

/** Leaderboard: only names and aggregate scores leave the database. */
export async function classLeaderboard(classId: string) {
  return db
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
}

export function listNotifications(userId: string, limit = 20) {
  return db
    .select({
      id: notifications.id,
      title: notifications.title,
      body: notifications.body,
      link: notifications.link,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadCount(userId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row.n;
}

/** Upcoming and in-progress live classes (ended ones drop off). */
export function listLiveSessions(classIds: string[]) {
  if (classIds.length === 0) return Promise.resolve([]);
  return db
    .select({
      id: liveSessions.id,
      classId: liveSessions.classId,
      className: classes.name,
      title: liveSessions.title,
      startsAt: liveSessions.startsAt,
      durationMinutes: liveSessions.durationMinutes,
      room: liveSessions.room,
    })
    .from(liveSessions)
    .innerJoin(classes, eq(liveSessions.classId, classes.id))
    .where(
      and(
        inArray(liveSessions.classId, classIds),
        gt(sql`${liveSessions.startsAt} + make_interval(mins => ${liveSessions.durationMinutes})`, sql`now()`),
      ),
    )
    .orderBy(asc(liveSessions.startsAt));
}

/** Boards the user owns, plus (for students) boards shared with their class. */
export function listBoards(user: { id: string; classId: string | null }) {
  return db
    .select({
      id: boards.id,
      title: boards.title,
      updatedAt: boards.updatedAt,
      ownerId: boards.ownerId,
      ownerName: users.name,
      sharedClassId: boards.sharedClassId,
    })
    .from(boards)
    .innerJoin(users, eq(boards.ownerId, users.id))
    .where(user.classId ? or(eq(boards.ownerId, user.id), eq(boards.sharedClassId, user.classId)) : eq(boards.ownerId, user.id))
    .orderBy(desc(boards.updatedAt));
}

export async function getBoardForUser(user: { id: string; classId: string | null }, boardId: string) {
  const board = await db.query.boards.findFirst({ where: (b, { eq }) => eq(b.id, boardId) });
  if (!board) notFound();
  const isOwner = board.ownerId === user.id;
  if (!isOwner && !(user.classId && board.sharedClassId === user.classId)) notFound();
  return { board, readOnly: !isOwner };
}

export function listAuditLog(userId: string) {
  return db
    .select({ action: auditLog.action, detail: auditLog.detail, ip: auditLog.ip, createdAt: auditLog.createdAt })
    .from(auditLog)
    .where(eq(auditLog.userId, userId))
    .orderBy(desc(auditLog.createdAt))
    .limit(25);
}

/* ----------------------------- teacher ----------------------------- */

export function listTeacherClasses(teacherId: string) {
  return db
    .select({
      id: classes.id,
      name: classes.name,
      studentCount: sql<number>`(select count(*) from ${users} where ${users.classId} = ${classes.id})`.mapWith(Number),
      quizCount: sql<number>`(select count(*) from ${quizzes} where ${quizzes.classId} = ${classes.id})`.mapWith(Number),
      averagePercent: sql<number | null>`(
        select avg((a.score::float / nullif(a.total, 0)) * 100) from ${attempts} a
        join ${quizzes} q on q.id = a.quiz_id where q.class_id = ${classes.id} and a.submitted_at is not null
      )`.mapWith((v) => (v == null ? null : Number(v))),
    })
    .from(classes)
    .where(eq(classes.teacherId, teacherId))
    .orderBy(asc(classes.name));
}

/** Open quizzes across all of a teacher's classes, with submission progress. */
export function teacherOpenQuizzes(teacherId: string) {
  return db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      className: classes.name,
      deadline: quizzes.deadline,
      submissions: sql<number>`(select count(*) from ${attempts} where ${attempts.quizId} = ${quizzes.id} and ${attempts.submittedAt} is not null)`.mapWith(Number),
      classSize: sql<number>`(select count(*) from ${users} where ${users.classId} = ${classes.id})`.mapWith(Number),
    })
    .from(quizzes)
    .innerJoin(classes, eq(quizzes.classId, classes.id))
    .where(and(eq(classes.teacherId, teacherId), gte(quizzes.deadline, sql`now()`)))
    .orderBy(asc(quizzes.deadline));
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
    .select({
      id: users.id,
      name: users.name,
      rollNumber: users.rollNumber,
      email: users.email,
      mustChangePassword: users.mustChangePassword,
      quizzesTaken: sql<number>`(select count(*) from ${attempts} where ${attempts.studentId} = ${users.id} and ${attempts.submittedAt} is not null)`.mapWith(Number),
      averagePercent: sql<number | null>`(select avg((score::float / nullif(total, 0)) * 100) from ${attempts} where ${attempts.studentId} = ${users.id} and ${attempts.submittedAt} is not null)`.mapWith(
        (v) => (v == null ? null : Number(v)),
      ),
    })
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
      averagePercent: sql<number | null>`(select avg((score::float / nullif(total, 0)) * 100) from ${attempts} where ${attempts.quizId} = ${quizzes.id} and ${attempts.submittedAt} is not null)`.mapWith(
        (v) => (v == null ? null : Number(v)),
      ),
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
      // How many picked each option, to spot the most tempting wrong answer.
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

  const [classSize] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.classId, row.quiz.classId), eq(users.role, "student")));

  return {
    quiz: row.quiz,
    className: row.className,
    questionStats: questionStats.map((q) => ({
      ...q,
      optionCounts: q.options.map((_, i) => q.picks.filter((p) => p === i).length),
    })),
    results,
    classSize: classSize.n,
  };
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
 * Everything the quiz page needs for one student, in THIS student's shuffled order.
 * Option indexes in the result are display positions. Correct answers are only
 * included after the student has submitted AND the deadline has passed, so finished
 * students can't share the answer key with classmates still working.
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
  const saved = attempt ? await db.query.answers.findMany({ where: (a, { eq }) => eq(a.attemptId, attempt!.id) }) : [];
  const selectedByQuestion = new Map(saved.map((a) => [a.questionId, a.selectedIndex]));

  const layout = attempt?.layout;
  const byId = new Map(questionRows.map((q) => [q.id, q]));
  const ordered = layout ? layout.questionOrder.map((id) => byId.get(id)!).filter(Boolean) : questionRows;

  return {
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
      // Class average for the same quiz, as a fair comparison point.
      classAverage: sql<number | null>`(select avg((a2.score::float / nullif(a2.total, 0)) * 100) from ${attempts} a2 where a2.quiz_id = ${quizzes.id} and a2.submitted_at is not null)`.mapWith(
        (v) => (v == null ? null : Number(v)),
      ),
    })
    .from(attempts)
    .innerJoin(quizzes, eq(attempts.quizId, quizzes.id))
    .where(and(eq(attempts.studentId, studentId), isNotNull(attempts.submittedAt)))
    .orderBy(asc(attempts.submittedAt));

  return { bySubject, history };
}
