"use server";

import { timingSafeEqual } from "node:crypto";
import { refresh } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { courseForStudent } from "@/lib/access";
import { requireStudent } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/auth/throttle";
import { firstIssue, type FormState } from "@/lib/form";
import { assignmentWindow } from "@/lib/grading";
import { notifyUser } from "@/lib/notify";
import { attemptEndsAt, buildLayout, chooseQuestions, finalizeAttempt, finalizeExpiredAttempts, isAttemptOpen } from "@/lib/quiz-engine";
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

/**
 * Starts the student's next attempt (attempt 1, or a further one when the quiz allows it).
 * Refused before the quiz opens, after the deadline, while another attempt is open, or
 * once the attempts allowed are used up. The database enforces the last three as well.
 */
export async function startAttempt(formData: FormData) {
  const found = await quizForStudent(uuid.parse(formData.get("quizId")));
  if (!found || found.quiz.deadline.getTime() <= Date.now()) return;
  const { user, quiz } = found;
  if (quiz.opensAt && quiz.opensAt.getTime() > Date.now()) return;
  // A previous attempt whose time ran out must be closed before the next one starts.
  await finalizeExpiredAttempts({ quizId: quiz.id });
  await db.transaction(async (tx) => {
    // Shared lock on the quiz: an instructor's updateQuiz (which takes FOR UPDATE) can't
    // swap the questions between our reading them and creating the attempt.
    await tx.select({ id: schema.quizzes.id }).from(schema.quizzes).where(eq(schema.quizzes.id, quiz.id)).for("share");
    const mine = await tx
      .select({ attemptNumber: schema.attempts.attemptNumber, submittedAt: schema.attempts.submittedAt })
      .from(schema.attempts)
      .where(and(eq(schema.attempts.quizId, quiz.id), eq(schema.attempts.studentId, user.id)));
    if (mine.some((a) => !a.submittedAt) || mine.length >= quiz.maxAttempts) return;

    const qs = await tx
      .select({ id: schema.questions.id, options: schema.questions.options, type: schema.questions.type, position: schema.questions.position, slotId: schema.questions.slotId, points: schema.questions.points })
      .from(schema.questions)
      .where(eq(schema.questions.quizId, quiz.id));
    const slots = await tx
      .select({ id: schema.quizSlots.id, position: schema.quizSlots.position, pickCount: schema.quizSlots.pickCount })
      .from(schema.quizSlots)
      .where(eq(schema.quizSlots.quizId, quiz.id));
    // How often each pool question has been given so far, so neighbours get different picks.
    const usage = new Map<string, number>();
    if (slots.length) {
      const layouts = await tx.select({ layout: schema.attempts.layout }).from(schema.attempts).where(eq(schema.attempts.quizId, quiz.id));
      for (const { layout } of layouts) for (const id of layout?.questionOrder ?? []) usage.set(id, (usage.get(id) ?? 0) + 1);
    }
    const given = chooseQuestions(qs, slots, usage);
    if (given.length === 0) return;
    // UNIQUE (quiz, student, attempt number) and "one open attempt" make a duplicate start
    // impossible even if two requests race. The layout fixes this attempt's picks and order.
    await tx
      .insert(schema.attempts)
      .values({
        quizId: quiz.id,
        studentId: user.id,
        attemptNumber: mine.length + 1,
        total: given.reduce((s, q) => s + q.points, 0),
        layout: buildLayout(given, quiz.shuffle),
      })
      .onConflictDoNothing();
  });
  refresh();
}

const answerInput = z.object({
  quizId: uuid,
  questionId: uuid,
  // Choice questions: positions of the options as SHOWN to this student; mapped back to the
  // original options below. Exactly one kind of response is sent per question type.
  displayIndex: z.number().int().min(0).max(5).optional(),
  displayIndexes: z.array(z.number().int().min(0).max(5)).max(6).optional(),
  text: z.string().max(500).optional(),
  number: z.number().finite().nullable().optional(),
});

export type SaveAnswerResult = { ok: true } | { ok: false; reason: "closed" | "invalid" };

/**
 * Saves one answer immediately, so nothing is lost if the tab closes or time runs out.
 * An empty text, an empty selection or a null number clears the answer.
 */
export async function saveAnswer(input: z.input<typeof answerInput>): Promise<SaveAnswerResult> {
  const parsed = answerInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { quizId, questionId } = parsed.data;
  const found = await quizForStudent(quizId);
  if (!found) return { ok: false, reason: "invalid" };
  const { user, quiz } = found;

  // Check and write in ONE transaction, holding a lock on the attempt: finalisation takes
  // the same lock, so an answer can never be stored after the attempt has been scored.
  return db.transaction(async (tx): Promise<SaveAnswerResult> => {
    const [attempt] = await tx
      .select()
      .from(schema.attempts)
      .where(and(eq(schema.attempts.quizId, quizId), eq(schema.attempts.studentId, user.id), isNull(schema.attempts.submittedAt)))
      .for("update");
    if (!attempt || attempt.submittedAt || !isAttemptOpen(attempt, quiz)) return { ok: false, reason: "closed" };

    const [question] = await tx
      .select({ type: schema.questions.type, options: schema.questions.options, slotId: schema.questions.slotId })
      .from(schema.questions)
      .where(and(eq(schema.questions.id, questionId), eq(schema.questions.quizId, quizId)));
    // Only questions this attempt was given (random picks are per attempt).
    if (!question || !(attempt.layout ? attempt.layout.questionOrder.includes(questionId) : !question.slotId)) return { ok: false, reason: "invalid" };

    const toOriginal = (d: number) => attempt.layout?.optionOrders[questionId]?.[d] ?? d;
    const response = { selectedIndex: null as number | null, selectedIndexes: null as number[] | null, textAnswer: null as string | null, numberAnswer: null as number | null };
    let clear = false;
    const { displayIndex, displayIndexes, text, number } = parsed.data;
    switch (question.type) {
      case "single":
      case "true_false": {
        if (displayIndex == null || displayIndex >= question.options.length) return { ok: false, reason: "invalid" };
        response.selectedIndex = toOriginal(displayIndex);
        break;
      }
      case "multiple": {
        if (!displayIndexes || displayIndexes.some((d) => d >= question.options.length)) return { ok: false, reason: "invalid" };
        const picked = [...new Set(displayIndexes.map(toOriginal))].sort((a, b) => a - b);
        if (picked.length === 0) clear = true;
        else response.selectedIndexes = picked;
        break;
      }
      case "short_answer": {
        if (text == null) return { ok: false, reason: "invalid" };
        const trimmed = text.trim();
        if (trimmed === "") clear = true;
        else response.textAnswer = trimmed;
        break;
      }
      case "numerical": {
        if (number === undefined) return { ok: false, reason: "invalid" };
        if (number === null) clear = true;
        else response.numberAnswer = number;
        break;
      }
    }
    if (response.selectedIndex != null && (response.selectedIndex < 0 || response.selectedIndex >= question.options.length)) return { ok: false, reason: "invalid" };

    if (clear) {
      await tx.delete(schema.answers).where(and(eq(schema.answers.attemptId, attempt.id), eq(schema.answers.questionId, questionId)));
    } else {
      await tx
        .insert(schema.answers)
        .values({ attemptId: attempt.id, quizId, questionId, ...response })
        .onConflictDoUpdate({ target: [schema.answers.attemptId, schema.answers.questionId], set: response });
    }
    return { ok: true };
  });
}

/** Submit early, or called by the client timer at zero. Grading happens server-side. */
export async function submitAttempt(quizId: string) {
  const found = await quizForStudent(uuid.parse(quizId));
  if (!found) return;
  const attempt = await db.query.attempts.findFirst({
    where: (a, { and, eq, isNull }) => and(eq(a.quizId, found.quiz.id), eq(a.studentId, found.user.id), isNull(a.submittedAt)),
  });
  // Never record a finish time later than the attempt's real end (the client may call
  // this a moment after the timer hits zero).
  if (attempt) await finalizeAttempt(attempt.id, new Date(Math.min(Date.now(), attemptEndsAt(attempt, found.quiz).getTime())));
  refresh();
}
