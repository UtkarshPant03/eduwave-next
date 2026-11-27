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
import { attemptEndsAt, buildLayout, finalizeAttempt, isAttemptOpen } from "@/lib/quiz-engine";
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

  // Validate the upload BEFORE the transaction: reading a file shouldn't hold row locks.
  const file = formData.get("file");
  let upload: Awaited<ReturnType<typeof checkUpload>> | null = null;
  if (file instanceof File && file.size > 0) {
    upload = await checkUpload(file);
    if ("error" in upload) return { error: upload.error };
  }
  const text = parsed.data.text || null;

  const result = await db.transaction(async (tx) => {
    // Lock this student's submission (if any): an instructor grading at the same moment
    // waits for us, and we can't overwrite work that was graded after we looked.
    const [existing] = await tx
      .select({ id: schema.submissions.id, grade: schema.submissions.grade, fileId: schema.submissions.fileId })
      .from(schema.submissions)
      .where(and(eq(schema.submissions.assignmentId, assignment.id), eq(schema.submissions.studentId, user.id)))
      .for("update");
    if (existing?.grade != null) return { error: "This submission has already been graded and can't be changed." };

    let fileId = existing?.fileId ?? null;
    if (upload && !("error" in upload)) {
      const [f] = await tx
        .insert(schema.files)
        .values({ courseId: course.id, uploaderId: user.id, size: upload.data.length, ...upload })
        .returning({ id: schema.files.id });
      fileId = f.id;
    }
    if (!text && !fileId) return { error: "Add some text or attach a file." };

    await tx
      .insert(schema.submissions)
      .values({ assignmentId: assignment.id, studentId: user.id, text, fileId })
      .onConflictDoUpdate({
        target: [schema.submissions.assignmentId, schema.submissions.studentId],
        set: { text, fileId, submittedAt: sql`now()` },
        // Belt and braces: never touch a graded submission.
        setWhere: sql`${schema.submissions.grade} is null`,
      });
    // Remove the replaced file only after the new one is safely referenced.
    if (existing?.fileId && existing.fileId !== fileId) await tx.delete(schema.files).where(eq(schema.files.id, existing.fileId));
    return { first: !existing };
  });
  if ("error" in result) return { error: result.error };
  const existing = !result.first;

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
  await db.transaction(async (tx) => {
    // Shared lock on the quiz: an instructor's updateQuiz (which takes FOR UPDATE) can't
    // swap the questions between our reading them and creating the attempt.
    await tx.select({ id: schema.quizzes.id }).from(schema.quizzes).where(eq(schema.quizzes.id, quiz.id)).for("share");
    const qs = await tx
      .select({ id: schema.questions.id, options: schema.questions.options })
      .from(schema.questions)
      .where(eq(schema.questions.quizId, quiz.id));
    if (qs.length === 0) return;
    // The unique (quiz, student) constraint makes a second attempt impossible, even if two
    // requests race. The layout fixes this student's shuffled order.
    await tx
      .insert(schema.attempts)
      .values({ quizId: quiz.id, studentId: user.id, total: qs.length, layout: buildLayout(qs, quiz.shuffle) })
      .onConflictDoNothing();
  });
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

  // Check and write in ONE transaction, holding a lock on the attempt: finalisation takes
  // the same lock, so an answer can never be stored after the attempt has been scored.
  return db.transaction(async (tx): Promise<SaveAnswerResult> => {
    const [attempt] = await tx
      .select()
      .from(schema.attempts)
      .where(and(eq(schema.attempts.quizId, quizId), eq(schema.attempts.studentId, user.id)))
      .for("update");
    if (!attempt || attempt.submittedAt || !isAttemptOpen(attempt, quiz)) return { ok: false, reason: "closed" };

    const [question] = await tx
      .select({ options: schema.questions.options })
      .from(schema.questions)
      .where(and(eq(schema.questions.id, questionId), eq(schema.questions.quizId, quizId)));
    if (!question || displayIndex >= question.options.length) return { ok: false, reason: "invalid" };
    const selectedIndex = attempt.layout?.optionOrders[questionId]?.[displayIndex] ?? displayIndex;
    if (selectedIndex < 0 || selectedIndex >= question.options.length) return { ok: false, reason: "invalid" };

    await tx
      .insert(schema.answers)
      .values({ attemptId: attempt.id, quizId, questionId, selectedIndex })
      .onConflictDoUpdate({ target: [schema.answers.attemptId, schema.answers.questionId], set: { selectedIndex } });
    return { ok: true };
  });
}

/** Submit early, or called by the client timer at zero. Grading happens server-side. */
export async function submitAttempt(quizId: string) {
  const found = await quizForStudent(uuid.parse(quizId));
  if (!found) return;
  const attempt = await db.query.attempts.findFirst({
    where: (a, { and, eq }) => and(eq(a.quizId, found.quiz.id), eq(a.studentId, found.user.id)),
  });
  // Never record a finish time later than the attempt's real end (the client may call
  // this a moment after the timer hits zero).
  if (attempt) await finalizeAttempt(attempt.id, new Date(Math.min(Date.now(), attemptEndsAt(attempt, found.quiz).getTime())));
  refresh();
}
