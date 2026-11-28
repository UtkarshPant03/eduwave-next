"use server";

import { timingSafeEqual } from "node:crypto";
import { refresh } from "next/cache";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { courseForStudent } from "@/lib/access";
import { requireStudent } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/auth/throttle";
import { firstIssue, type FormState } from "@/lib/form";
import { assignmentWindow } from "@/lib/grading";
import { notifyUser } from "@/lib/notify";
import { attemptEndsAt, buildLayout, chooseQuestions, finalizeAttempt, finalizeExpiredAttempts, isAttemptOpen } from "@/lib/quiz-engine";
import { checkUploads } from "@/lib/uploads";

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

/** Thrown inside the transaction to roll back files already inserted. */
class SubmitRefused extends Error {}

/**
 * Submits or resubmits. Every call before grading creates a new read-only VERSION (text +
 * files); earlier versions are kept. Files of the previous version can be kept (`keep`
 * holds their ids) and new ones added (`files`), up to the assignment's maximum.
 */
export async function submitAssignment(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireStudent();
  const parsed = submissionInput.safeParse({ assignmentId: formData.get("assignmentId"), text: formData.get("text") ?? undefined });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const keepParsed = z.array(uuid).max(20).safeParse(formData.getAll("keep"));
  if (!keepParsed.success) return { error: "Invalid file selection." };
  const assignment = await db.query.assignments.findFirst({ where: (a, { eq }) => eq(a.id, parsed.data.assignmentId) });
  if (!assignment) return { error: "Assignment not found." };
  const course = await courseForStudent(user, assignment.courseId);

  const window = assignmentWindow(assignment, Date.now());
  if (!window.open) return { error: "Submissions for this assignment are closed." };

  // Validate the uploads BEFORE the transaction: reading files shouldn't hold row locks.
  // (The legacy single-file field name "file" is accepted too.)
  const uploads = await checkUploads([...formData.getAll("files"), ...formData.getAll("file")], assignment.maxFiles);
  if ("error" in uploads) return { error: uploads.error };
  const text = parsed.data.text || null;
  const max = assignment.maxFiles;

  let result: { first: boolean; versionNumber: number } | { error: string };
  try {
    result = await db.transaction(async (tx) => {
      // Lock this student's submission (if any): an instructor grading at the same moment
      // waits for us, and we can't add a version to work that was graded after we looked.
      const [existing] = await tx
        .select({ id: schema.submissions.id, grade: schema.submissions.grade, fileId: schema.submissions.fileId, text: schema.submissions.text, submittedAt: schema.submissions.submittedAt })
        .from(schema.submissions)
        .where(and(eq(schema.submissions.assignmentId, assignment.id), eq(schema.submissions.studentId, user.id)))
        .for("update");
      if (existing?.grade != null) return { error: "This submission has already been graded and can't be changed." };

      // Files of the latest version: the only ones that may be kept.
      let latestFiles: string[] = [];
      if (existing) {
        const versions = await tx
          .select({ id: schema.submissionVersions.id })
          .from(schema.submissionVersions)
          .where(eq(schema.submissionVersions.submissionId, existing.id))
          .orderBy(desc(schema.submissionVersions.versionNumber))
          .limit(1);
        if (versions[0]) {
          const rows = await tx
            .select({ fileId: schema.submissionFiles.fileId })
            .from(schema.submissionFiles)
            .where(eq(schema.submissionFiles.versionId, versions[0].id))
            .orderBy(asc(schema.submissionFiles.position));
          latestFiles = rows.map((r) => r.fileId);
        } else {
          // A submission written before versions existed (and not back-filled): record it
          // as version 1 first, so the history keeps it.
          const [v1] = await tx
            .insert(schema.submissionVersions)
            .values({ submissionId: existing.id, versionNumber: 1, text: existing.text, submittedAt: existing.submittedAt })
            .returning({ id: schema.submissionVersions.id });
          if (existing.fileId) {
            await tx.insert(schema.submissionFiles).values({ versionId: v1.id, fileId: existing.fileId, position: 0 });
            latestFiles = [existing.fileId];
          }
        }
      }
      const keep = new Set(keepParsed.data);
      const kept = latestFiles.filter((id) => keep.has(id));
      if (kept.length + uploads.length > max)
        return { error: `This assignment accepts at most ${max} file${max === 1 ? "" : "s"}. Remove some before adding more.` };
      if (!text && kept.length + uploads.length === 0) return { error: "Add some text or attach a file." };

      const added = uploads.length
        ? await tx
            .insert(schema.files)
            .values(uploads.map((u) => ({ courseId: course.id, uploaderId: user.id, size: u.data.length, ...u })))
            .returning({ id: schema.files.id })
        : [];
      const fileIds = [...kept, ...added.map((f) => f.id)];

      const [sub] = await tx
        .insert(schema.submissions)
        .values({ assignmentId: assignment.id, studentId: user.id, text, fileId: fileIds[0] ?? null })
        .onConflictDoUpdate({
          target: [schema.submissions.assignmentId, schema.submissions.studentId],
          set: { text, fileId: fileIds[0] ?? null, submittedAt: sql`now()` },
          // Belt and braces: never touch a graded submission.
          setWhere: sql`${schema.submissions.grade} is null`,
        })
        .returning({ id: schema.submissions.id, submittedAt: schema.submissions.submittedAt });
      // Nothing returned: it was graded in the meantime. Roll back the files inserted above.
      if (!sub) throw new SubmitRefused("This submission has already been graded and can't be changed.");

      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${schema.submissionVersions.versionNumber}), 0) + 1`.mapWith(Number) })
        .from(schema.submissionVersions)
        .where(eq(schema.submissionVersions.submissionId, sub.id));
      const [version] = await tx
        .insert(schema.submissionVersions)
        .values({ submissionId: sub.id, versionNumber: next, text, submittedAt: sub.submittedAt })
        .returning({ id: schema.submissionVersions.id });
      if (fileIds.length) await tx.insert(schema.submissionFiles).values(fileIds.map((fileId, position) => ({ versionId: version.id, fileId, position })));
      return { first: !existing, versionNumber: next };
    });
  } catch (err) {
    if (err instanceof SubmitRefused) return { error: err.message };
    throw err;
  }
  if ("error" in result) return { error: result.error };

  if (result.first) {
    await notifyUser(course.instructorId, {
      title: `${course.code}: new submission`,
      body: `${user.name} · ${assignment.title}${window.late ? " (late)" : ""}`,
      link: `/instructor/assignments/${assignment.id}`,
    });
  }
  refresh();
  if (window.late) return { success: result.first ? "Submitted (late)." : `Submission updated (late): version ${result.versionNumber} saved.` };
  return { success: result.first ? "Submitted. Good luck!" : `Submission updated: version ${result.versionNumber} saved.` };
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
