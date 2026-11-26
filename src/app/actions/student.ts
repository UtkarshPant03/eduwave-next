"use server";

import { timingSafeEqual } from "node:crypto";
import { refresh } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { courseForStudent } from "@/lib/access";
import { requireStudent } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/auth/throttle";
import { firstIssue, type FormState } from "@/lib/form";
import { assignmentWindow } from "@/lib/grading";
import { notifyUser } from "@/lib/notify";
import { buildLayout, finalizeAttempt, isAttemptOpen } from "@/lib/quiz-engine";
import { checkUpload } from "@/lib/uploads";

const uuid = z.uuid();

/* -------------------------------- enrolment -------------------------------- */

/** Constant-time comparison so the key can't be guessed character by character via timing. */
function keysMatch(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function enrolWithKey(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireStudent();
  const courseId = uuid.parse(formData.get("courseId"));
  const key = String(formData.get("key") ?? "").trim();
  if (!(await rateLimit(`enrol:${user.id}`, 10, 15 * 60_000))) return { error: "Too many attempts. Try again in 15 minutes." };

  const course = await db.query.courses.findFirst({ where: (c, { and, eq }) => and(eq(c.id, courseId), eq(c.published, true)) });
  if (!course?.enrollmentKey) return { error: "This course doesn't allow self-enrolment. Ask your instructor." };
  if (!keysMatch(key, course.enrollmentKey)) return { error: "That enrolment key isn't correct." };

  await db.insert(schema.enrollments).values({ courseId, userId: user.id }).onConflictDoNothing();
  refresh();
  return { success: `You're enrolled in ${course.code}. Welcome!` };
}

/* -------------------------------- completion -------------------------------- */

/** Manual "mark as done" for materials and live sessions. */
export async function setCompletion(courseId: string, itemId: string, done: boolean) {
  const user = await requireStudent();
  const course = await courseForStudent(user, uuid.parse(courseId));
  const id = uuid.parse(itemId);
  // The item must be a resource or live session of THIS course.
  const [r, l] = await Promise.all([
    db.query.resources.findFirst({ where: (x, { and, eq }) => and(eq(x.id, id), eq(x.courseId, course.id)) }),
    db.query.liveSessions.findFirst({ where: (x, { and, eq }) => and(eq(x.id, id), eq(x.courseId, course.id)) }),
  ]);
  if (!r && !l) return;
  if (done) await db.insert(schema.completions).values({ userId: user.id, itemId: id, courseId: course.id }).onConflictDoNothing();
  else await db.delete(schema.completions).where(and(eq(schema.completions.userId, user.id), eq(schema.completions.itemId, id)));
  refresh();
}

/* -------------------------------- assignments -------------------------------- */

const submissionInput = z.object({
  assignmentId: uuid,
  text: z.string().trim().max(50_000).optional(),
});

export async function submitAssignment(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireStudent();
  const parsed = submissionInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const assignment = await db.query.assignments.findFirst({ where: (a, { eq }) => eq(a.id, parsed.data.assignmentId) });
  if (!assignment) return { error: "Assignment not found." };
  const course = await courseForStudent(user, assignment.courseId);

  const window = assignmentWindow(assignment, Date.now());
  if (!window.open) return { error: "Submissions for this assignment are closed." };
  const existing = await db.query.submissions.findFirst({
    where: (s, { and, eq }) => and(eq(s.assignmentId, assignment.id), eq(s.studentId, user.id)),
  });
  if (existing?.grade != null) return { error: "This submission has already been graded and can't be changed." };

  const file = formData.get("file");
  let fileId = existing?.fileId ?? null;
  if (file instanceof File && file.size > 0) {
    const checked = await checkUpload(file);
    if ("error" in checked) return { error: checked.error };
    const [f] = await db
      .insert(schema.files)
      .values({ courseId: course.id, uploaderId: user.id, size: checked.data.length, ...checked })
      .returning({ id: schema.files.id });
    if (existing?.fileId) await db.delete(schema.files).where(eq(schema.files.id, existing.fileId));
    fileId = f.id;
  }
  const text = parsed.data.text || null;
  if (!text && !fileId) return { error: "Add some text or attach a file." };

  await db
    .insert(schema.submissions)
    .values({ assignmentId: assignment.id, studentId: user.id, text, fileId })
    .onConflictDoUpdate({
      target: [schema.submissions.assignmentId, schema.submissions.studentId],
      set: { text, fileId, submittedAt: sql`now()` },
    });

  if (!existing) {
    await notifyUser(course.instructorId, {
      title: `${course.code}: new submission`,
      body: `${user.name} · ${assignment.title}${window.late ? " (late)" : ""}`,
      link: `/instructor/assignments/${assignment.id}`,
    });
  }
  refresh();
  return { success: window.late ? "Submitted (late)." : existing ? "Submission updated." : "Submitted. Good luck!" };
}

/* ---------------------------------- quizzes ---------------------------------- */

/** Loads a quiz only if the student is enrolled in its course. */
async function quizForStudent(quizId: string) {
  const user = await requireStudent();
  const quiz = await db.query.quizzes.findFirst({ where: (q, { eq }) => eq(q.id, quizId) });
  if (!quiz) return null;
  await courseForStudent(user, quiz.courseId);
  return { user, quiz };
}

export async function startAttempt(formData: FormData) {
  const found = await quizForStudent(uuid.parse(formData.get("quizId")));
  if (!found || found.quiz.deadline.getTime() <= Date.now()) return;
  const { user, quiz } = found;
  const qs = await db.query.questions.findMany({ where: (q, { eq }) => eq(q.quizId, quiz.id), columns: { id: true, options: true } });
  // The unique (quiz, student) constraint makes a second attempt impossible, even if two
  // requests race. The layout fixes this student's shuffled order.
  await db
    .insert(schema.attempts)
    .values({ quizId: quiz.id, studentId: user.id, total: qs.length, layout: buildLayout(qs, quiz.shuffle) })
    .onConflictDoNothing();
  refresh();
}

const answerInput = z.object({
  quizId: uuid,
  questionId: uuid,
  // Position of the option as SHOWN to this student; mapped back to the original below.
  displayIndex: z.number().int().min(0).max(5),
});

export type SaveAnswerResult = { ok: true } | { ok: false; reason: "closed" | "invalid" };

/** Saves one answer immediately, so nothing is lost if the tab closes or time runs out. */
export async function saveAnswer(input: z.input<typeof answerInput>): Promise<SaveAnswerResult> {
  const parsed = answerInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { quizId, questionId, displayIndex } = parsed.data;
  const found = await quizForStudent(quizId);
  if (!found) return { ok: false, reason: "invalid" };
  const { user, quiz } = found;

  const attempt = await db.query.attempts.findFirst({ where: (a, { and, eq }) => and(eq(a.quizId, quizId), eq(a.studentId, user.id)) });
  if (!attempt || attempt.submittedAt || !isAttemptOpen(attempt, quiz)) return { ok: false, reason: "closed" };

  const question = await db.query.questions.findFirst({ where: (q, { and, eq }) => and(eq(q.id, questionId), eq(q.quizId, quizId)) });
  if (!question || displayIndex >= question.options.length) return { ok: false, reason: "invalid" };
  const selectedIndex = attempt.layout?.optionOrders[questionId]?.[displayIndex] ?? displayIndex;

  await db
    .insert(schema.answers)
    .values({ attemptId: attempt.id, questionId, selectedIndex })
    .onConflictDoUpdate({ target: [schema.answers.attemptId, schema.answers.questionId], set: { selectedIndex } });
  return { ok: true };
}

/** Submit early, or called by the client timer at zero. Grading happens server-side. */
export async function submitAttempt(quizId: string) {
  const found = await quizForStudent(uuid.parse(quizId));
  if (!found) return;
  const attempt = await db.query.attempts.findFirst({
    where: (a, { and, eq }) => and(eq(a.quizId, found.quiz.id), eq(a.studentId, found.user.id)),
  });
  if (attempt) await finalizeAttempt(attempt.id);
  refresh();
}
