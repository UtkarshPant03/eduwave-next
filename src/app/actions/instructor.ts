"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { courseForInstructor } from "@/lib/access";
import type { CourseCapability } from "@/lib/auth/capabilities";
import { aiEnabled, generateQuestions, type GeneratedQuestion } from "@/lib/ai";
import { requireInstructor } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/auth/throttle";
import { COURSE_COLORS } from "@/lib/course-colors";
import { firstIssue, type FormState } from "@/lib/form";
import { formatDateTime } from "@/lib/format";
import { audit } from "@/lib/audit";
import { notifyCourse, notifyUser, notifyUsers } from "@/lib/notify";
import { checkUpload, checkUploads, MAX_FILES_LIMIT } from "@/lib/uploads";
import { isForeignKeyViolation } from "@/lib/db-errors";
import { checkQuestion, GRADING_METHODS, MAX_ATTEMPTS, questionFields, toQuestionColumns } from "@/lib/questions";

const uuid = z.uuid();
const isoDate = (msg: string) => z.iso.datetime({ message: msg }).transform((s) => new Date(s));
const optionalUuid = z
  .string()
  .optional()
  .transform((s) => s || null)
  .pipe(z.uuid().nullable());

/**
 * Serialises structural changes to one course (sections): concurrent "add section" calls
 * would otherwise compute the same next position. Call inside a transaction.
 */
async function lockCourse(tx: Pick<typeof db, "select">, courseId: string) {
  await tx.select({ id: schema.courses.id }).from(schema.courses).where(eq(schema.courses.id, courseId)).for("update");
}

/** Authorise: signed-in course staff with the capability (default: manage the course). */
async function ownCourse(courseId: unknown, capability: CourseCapability = "course.manage") {
  const user = await requireInstructor();
  const course = await courseForInstructor(user, uuid.parse(courseId), capability);
  return { user, course };
}

/** A section id from the client must belong to the same course. */
async function checkSection(courseId: string, sectionId: string | null) {
  if (!sectionId) return null;
  const s = await db.query.sections.findFirst({ where: (x, { and, eq }) => and(eq(x.id, sectionId), eq(x.courseId, courseId)) });
  return s ? s.id : null;
}

/* ------------------------------ course settings ------------------------------ */

const settingsInput = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(4000).optional(),
  enrollmentKey: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((s) => s || null)
    .refine((s) => s === null || s.length >= 6, "Enrolment keys need at least 6 characters (or leave blank to close self-enrolment)."),
  color: z.enum(COURSE_COLORS),
  published: z.literal("on").optional(),
});

export async function updateCourseSettings(_: FormState, formData: FormData): Promise<FormState> {
  const { course } = await ownCourse(formData.get("courseId"));
  const parsed = settingsInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { published, ...rest } = parsed.data;
  await db
    .update(schema.courses)
    .set({ ...rest, description: rest.description || null, published: published === "on" })
    .where(eq(schema.courses.id, course.id));
  refresh();
  return { success: "Course settings saved." };
}

/* --------------------------------- sections --------------------------------- */

export async function addSection(_: FormState, formData: FormData): Promise<FormState> {
  const { course } = await ownCourse(formData.get("courseId"));
  const parsed = z
    .object({ title: z.string().trim().min(1, "Enter a section title.").max(120), summary: z.string().trim().max(1000).optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  await db.transaction(async (tx) => {
    await lockCourse(tx, course.id);
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${schema.sections.position}) + 1, 0)`.mapWith(Number) })
      .from(schema.sections)
      .where(eq(schema.sections.courseId, course.id));
    await tx.insert(schema.sections).values({ courseId: course.id, position: next, title: parsed.data.title, summary: parsed.data.summary || null });
  });
  refresh();
  return { success: "Section added." };
}

export async function updateSection(courseId: string, sectionId: string, title: string, summary: string) {
  const { course } = await ownCourse(courseId);
  const t = z.string().trim().min(1).max(120).parse(title);
  await db
    .update(schema.sections)
    .set({ title: t, summary: summary.trim().slice(0, 1000) || null })
    .where(and(eq(schema.sections.id, uuid.parse(sectionId)), eq(schema.sections.courseId, course.id)));
  refresh();
}

export async function moveSection(courseId: string, sectionId: string, direction: -1 | 1) {
  const { course } = await ownCourse(courseId);
  const dir = z.union([z.literal(-1), z.literal(1)]).parse(direction);
  await db.transaction(async (tx) => {
    await lockCourse(tx, course.id);
    // Read inside the lock, in a stable order (id breaks ties left by older duplicate positions).
    const all = await tx
      .select({ id: schema.sections.id })
      .from(schema.sections)
      .where(eq(schema.sections.courseId, course.id))
      .orderBy(asc(schema.sections.position), asc(schema.sections.id));
    const i = all.findIndex((s) => s.id === sectionId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= all.length) return;
    [all[i], all[j]] = [all[j], all[i]];
    // Renumber 0..n-1: swaps always take effect, and any duplicate positions are repaired.
    for (const [position, s] of all.entries()) {
      await tx.update(schema.sections).set({ position }).where(eq(schema.sections.id, s.id));
    }
  });
  refresh();
}

export async function deleteSection(courseId: string, sectionId: string) {
  const { course } = await ownCourse(courseId);
  // Activities in the section move to "General" (FK is ON DELETE SET NULL), nothing is lost.
  await db.transaction(async (tx) => {
    await lockCourse(tx, course.id);
    await tx.delete(schema.sections).where(and(eq(schema.sections.id, uuid.parse(sectionId)), eq(schema.sections.courseId, course.id)));
  });
  refresh();
}

/* ------------------------------- participants ------------------------------- */

export type EnrolResult = { added: string[]; already: string[]; notFound: string[] };

/** Enrols students by email or student ID (one per line / comma separated). */
export async function enrolStudents(courseId: string, list: string): Promise<EnrolResult> {
  const { user, course } = await ownCourse(courseId);
  const ids = [...new Set(list.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))].slice(0, 500);
  const emails = ids.filter((s) => s.includes("@")).map((s) => s.toLowerCase());
  const sids = ids.filter((s) => !s.includes("@")).map((s) => s.toUpperCase());
  const found = await db
    .select({ id: schema.users.id, email: schema.users.email, studentId: schema.users.studentId })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.role, "student"),
        sql`(${emails.length ? inArray(schema.users.email, emails) : sql`false`} or ${sids.length ? inArray(schema.users.studentId, sids) : sql`false`})`,
      ),
    );
  const result: EnrolResult = { added: [], already: [], notFound: [] };
  const byKey = new Map<string, string>(); // typed identifier -> user id
  for (const raw of ids) {
    const key = raw.includes("@") ? raw.toLowerCase() : raw.toUpperCase();
    const u = found.find((f) => f.email === key || f.studentId === key);
    if (u) byKey.set(raw, u.id);
    else result.notFound.push(raw);
  }
  const userIds = [...new Set(byKey.values())];
  // One INSERT for the whole list (not one round trip per student).
  const inserted = userIds.length
    ? await db
        .insert(schema.enrollments)
        .values(userIds.map((id) => ({ courseId: course.id, userId: id })))
        .onConflictDoNothing()
        .returning({ userId: schema.enrollments.userId })
    : [];
  const added = new Set(inserted.map((r) => r.userId));
  for (const [raw, id] of byKey) (added.has(id) ? result.added : result.already).push(raw);

  if (added.size) {
    await notifyUsers([...added], { title: `You've been enrolled in ${course.code}`, body: course.title, link: `/student/courses/${course.id}` });
    await audit(user.id, "enrolment_added", `${course.code} ${course.term}: ${added.size} student(s)`);
  }
  refresh();
  return result;
}

export async function unenrolStudent(courseId: string, userId: string) {
  const { user, course } = await ownCourse(courseId);
  const studentId = uuid.parse(userId);
  // Their submissions and attempts are kept (and come back if they are re-enrolled).
  const removed = await db
    .delete(schema.enrollments)
    .where(and(eq(schema.enrollments.courseId, course.id), eq(schema.enrollments.userId, studentId)))
    .returning();
  if (removed.length) await audit(studentId, "enrolment_removed", `${course.code} ${course.term}`, user.id);
  refresh();
}

/* -------------------------------- resources -------------------------------- */

const resourceInput = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(160),
  description: z.string().trim().max(1000).optional(),
  kind: z.enum(["link", "file"]),
  sectionId: optionalUuid,
});
// Only http(s) links: blocks `javascript:` URLs that would run code when clicked.
const httpUrl = z.url({ protocol: /^https?$/, message: "Enter a full http(s) link." });

export async function addResource(_: FormState, formData: FormData): Promise<FormState> {
  const { user, course } = await ownCourse(formData.get("courseId"));
  const parsed = resourceInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { title, description, kind } = parsed.data;
  const sectionId = await checkSection(course.id, parsed.data.sectionId);

  if (kind === "link") {
    const url = httpUrl.safeParse(formData.get("url"));
    if (!url.success) return { error: firstIssue(url.error) };
    await db.insert(schema.resources).values({ courseId: course.id, sectionId, title, description: description || null, url: url.data });
  } else {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
    const checked = await checkUpload(file);
    if ("error" in checked) return { error: checked.error };
    await db.transaction(async (tx) => {
      const [f] = await tx
        .insert(schema.files)
        .values({ courseId: course.id, uploaderId: user.id, size: checked.data.length, ...checked })
        .returning({ id: schema.files.id });
      await tx.insert(schema.resources).values({ courseId: course.id, sectionId, title, description: description || null, fileId: f.id });
    });
  }
  await notifyCourse(course.id, { title: `${course.code}: new material`, body: title, link: `/student/courses/${course.id}` });
  refresh();
  return { success: "Material added to the course." };
}

/* ------------------------------ generic delete ------------------------------ */

const DELETABLE = {
  resource: schema.resources,
  assignment: schema.assignments,
  quiz: schema.quizzes,
  live: schema.liveSessions,
} as const;

/**
 * Deletes an activity (and, for file resources, the stored file).
 *
 * Assignments and quizzes that students have already worked on are protected: deleting
 * them would silently destroy submissions and grades (the FKs cascade). The check is
 * here on the server, not just in the confirm() dialog, so no client can bypass it.
 */
export async function deleteActivity(courseId: string, kind: keyof typeof DELETABLE, id: string): Promise<{ error?: string }> {
  const { user, course } = await ownCourse(courseId);
  const table = DELETABLE[kind];
  if (!table) return { error: "Unknown activity type." };
  const activityId = uuid.parse(id);

  try {
    const error = await db.transaction(async (tx) => {
      // 1. The activity must belong to THIS course (checked before anything else, so no
      //    information about other courses' activities can leak). Locking the row means a
      //    student can't start/submit between the count below and the delete.
      const [own] = await tx
        .select({ id: table.id })
        .from(table)
        .where(and(eq(table.id, activityId), eq(table.courseId, course.id)))
        .for("update");
      if (!own) return "This activity no longer exists.";

      // 2. Never delete student work: refuse if anyone has submitted or attempted it.
      const studentWork =
        kind === "assignment"
          ? await tx.$count(schema.submissions, eq(schema.submissions.assignmentId, activityId))
          : kind === "quiz"
            ? await tx.$count(schema.attempts, eq(schema.attempts.quizId, activityId))
            : 0;
      if (studentWork > 0) {
        const what = kind === "assignment" ? "submitted work" : "attempted it";
        return `${studentWork} student${studentWork === 1 ? " has" : "s have"} ${what}, so it can't be deleted: that would erase their grades. You can still edit it, for example to change its deadline.`;
      }

      const [row] = await tx.delete(table).where(eq(table.id, activityId)).returning();
      // Completion ticks have no foreign key (they can point at resources or live classes).
      await tx.delete(schema.completions).where(eq(schema.completions.itemId, activityId));
      if (kind === "resource" && row && "fileId" in row && row.fileId) await tx.delete(schema.files).where(eq(schema.files.id, row.fileId));
      return null;
    });
    if (error) return { error };
  } catch (err) {
    // Backstop: the database itself refuses (ON DELETE RESTRICT) to delete graded work.
    if (isForeignKeyViolation(err)) return { error: "Students have work in this activity, so it can't be deleted." };
    throw err;
  }
  await audit(user.id, "activity_deleted", `${course.code} ${course.term}: ${kind} ${activityId}`);
  refresh();
  return {};
}

/* ------------------------------- assignments ------------------------------- */

const assignmentInput = z.object({
  courseId: uuid,
  sectionId: optionalUuid,
  title: z.string().trim().min(1, "Enter a title.").max(160),
  instructions: z.string().trim().min(1, "Write the instructions.").max(20_000),
  dueAt: isoDate("Choose a due date."),
  maxPoints: z.coerce.number().int().min(1).max(1000),
  lateDays: z.coerce.number().int().min(0).max(30),
  maxFiles: z.coerce.number().int("Whole numbers only.").min(1, "Allow at least 1 file.").max(MAX_FILES_LIMIT, `At most ${MAX_FILES_LIMIT} files.`).default(1),
});

export async function createAssignment(input: z.input<typeof assignmentInput>): Promise<FormState> {
  const parsed = assignmentInput.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { course } = await ownCourse(parsed.data.courseId);
  const a = parsed.data;
  if (a.dueAt.getTime() <= Date.now()) return { error: "The due date must be in the future." };
  const [row] = await db
    .insert(schema.assignments)
    .values({ ...a, courseId: course.id, sectionId: await checkSection(course.id, a.sectionId) })
    .returning({ id: schema.assignments.id });
  await notifyCourse(course.id, { title: `${course.code}: new assignment`, body: `${a.title} · due ${formatDateTime(a.dueAt)}`, link: `/student/assignments/${row.id}` });
  redirect(`/instructor/assignments/${row.id}`);
}

const assignmentUpdate = assignmentInput.omit({ courseId: true }).extend({ id: uuid });

/**
 * Edits an assignment, e.g. to extend the deadline or fix a typo. Grades stay valid:
 * the maximum can't drop below a grade already awarded. Students hear about date changes.
 */
export async function updateAssignment(input: z.input<typeof assignmentUpdate>): Promise<FormState> {
  const parsed = assignmentUpdate.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const user = await requireInstructor();
  const a = parsed.data;
  const existing = await db.query.assignments.findFirst({ where: (x, { eq }) => eq(x.id, a.id) });
  if (!existing) return { error: "Assignment not found." };
  const course = await courseForInstructor(user, existing.courseId);

  const [{ top }] = await db
    .select({ top: sql<string | null>`max(${schema.submissions.grade})` })
    .from(schema.submissions)
    .where(eq(schema.submissions.assignmentId, existing.id));
  if (top != null && a.maxPoints < Number(top))
    return { error: `A student already has ${top} points, so the maximum can't be lower than that.` };

  await db
    .update(schema.assignments)
    .set({
      title: a.title,
      instructions: a.instructions,
      sectionId: await checkSection(course.id, a.sectionId),
      dueAt: a.dueAt,
      maxPoints: a.maxPoints,
      lateDays: a.lateDays,
      // Lowering it never touches versions already submitted (they keep their files).
      maxFiles: a.maxFiles,
    })
    .where(eq(schema.assignments.id, existing.id));

  if (existing.dueAt.getTime() !== a.dueAt.getTime() || existing.lateDays !== a.lateDays) {
    const late = a.lateDays ? ` (late submissions accepted for ${a.lateDays} day${a.lateDays === 1 ? "" : "s"})` : "";
    await notifyCourse(course.id, { title: `${course.code}: deadline changed`, body: `${a.title} · now due ${formatDateTime(a.dueAt)}${late}`, link: `/student/assignments/${existing.id}` });
  }
  redirect(`/instructor/assignments/${existing.id}`);
}

const gradeInput = z.object({
  submissionId: uuid,
  grade: z.coerce.number().int("Whole points only.").min(0, "Grade can't be negative."),
  feedback: z.string().trim().max(5000).optional(),
  // The submission time the grader was looking at (optimistic concurrency): if the student
  // resubmitted since, the grade must not silently apply to a version nobody has read.
  version: z.iso.datetime().optional(),
});

export async function gradeSubmission(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireInstructor();
  const parsed = gradeInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const [row] = await db
    .select({ s: schema.submissions, a: schema.assignments })
    .from(schema.submissions)
    .innerJoin(schema.assignments, eq(schema.assignments.id, schema.submissions.assignmentId))
    .where(eq(schema.submissions.id, parsed.data.submissionId));
  if (!row) return { error: "Submission not found." };
  const course = await courseForInstructor(user, row.a.courseId, "grade.edit");
  const { grade } = parsed.data;
  const feedback = parsed.data.feedback || null;

  const error = await db.transaction(async (tx) => {
    // Lock the submission AND its assignment: no resubmission, and no change to the
    // maximum points, can slip in between these checks and the update.
    const [current] = await tx
      .select({ grade: schema.submissions.grade, feedback: schema.submissions.feedback, submittedAt: schema.submissions.submittedAt })
      .from(schema.submissions)
      .where(eq(schema.submissions.id, row.s.id))
      .for("update");
    const [assignment] = await tx
      .select({ maxPoints: schema.assignments.maxPoints })
      .from(schema.assignments)
      .where(eq(schema.assignments.id, row.a.id))
      .for("share");
    if (!current || !assignment) return "Submission not found.";
    if (grade > assignment.maxPoints) return `Maximum is ${assignment.maxPoints} points.`;
    if (parsed.data.version && new Date(parsed.data.version).getTime() !== current.submittedAt.getTime())
      return "The student resubmitted while you were grading. Reload to see the latest version.";
    if (current.grade === grade && current.feedback === feedback) return null; // nothing changed

    await tx
      .update(schema.submissions)
      .set({ grade, feedback, gradedAt: sql`now()`, gradedBy: user.id })
      .where(eq(schema.submissions.id, row.s.id));
    // Permanent history of every grade change, in the same transaction as the change.
    await tx.insert(schema.gradeEvents).values({
      submissionId: row.s.id,
      graderId: user.id,
      oldGrade: current.grade,
      newGrade: grade,
      feedbackChanged: current.feedback !== feedback,
    });
    return null;
  });
  if (error) return { error };

  await notifyUser(row.s.studentId, {
    title: `${course.code}: "${row.a.title}" graded`,
    body: `${grade} / ${row.a.maxPoints}`,
    link: `/student/assignments/${row.a.id}`,
  });
  refresh();
  return { success: "Grade saved and student notified." };
}

/** Feedback files one submission can carry (all graders together). */
const MAX_FEEDBACK_FILES = 10;

/**
 * Attaches files to a submission's feedback (graders: `grade.edit`, so TAs too). The
 * student can download them once the submission is graded; other students never can.
 */
export async function addFeedbackFiles(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireInstructor();
  const submissionId = uuid.safeParse(formData.get("submissionId"));
  if (!submissionId.success) return { error: "Submission not found." };
  const [row] = await db
    .select({ s: schema.submissions, a: schema.assignments })
    .from(schema.submissions)
    .innerJoin(schema.assignments, eq(schema.assignments.id, schema.submissions.assignmentId))
    .where(eq(schema.submissions.id, submissionId.data));
  if (!row) return { error: "Submission not found." };
  const course = await courseForInstructor(user, row.a.courseId, "grade.edit");

  const uploads = await checkUploads(formData.getAll("files"), MAX_FEEDBACK_FILES);
  if ("error" in uploads) return { error: uploads.error };
  if (uploads.length === 0) return { error: "Choose at least one file." };

  const error = await db.transaction(async (tx) => {
    // Lock the submission so two graders can't exceed the limit together.
    await tx.select({ id: schema.submissions.id }).from(schema.submissions).where(eq(schema.submissions.id, row.s.id)).for("update");
    const already = await tx.$count(schema.feedbackFiles, eq(schema.feedbackFiles.submissionId, row.s.id));
    if (already + uploads.length > MAX_FEEDBACK_FILES) return `A submission can have at most ${MAX_FEEDBACK_FILES} feedback files.`;
    const added = await tx
      .insert(schema.files)
      .values(uploads.map((u) => ({ courseId: course.id, uploaderId: user.id, size: u.data.length, ...u })))
      .returning({ id: schema.files.id });
    await tx.insert(schema.feedbackFiles).values(added.map((f) => ({ submissionId: row.s.id, fileId: f.id, uploadedBy: user.id })));
    return null;
  });
  if (error) return { error };

  // Before grading the student can't see feedback yet; they hear about it with the grade.
  if (row.s.grade != null) {
    await notifyUser(row.s.studentId, {
      title: `${course.code}: feedback file added`,
      body: row.a.title,
      link: `/student/assignments/${row.a.id}`,
    });
  }
  refresh();
  return { success: uploads.length === 1 ? "Feedback file attached." : `${uploads.length} feedback files attached.` };
}

/** Removes a feedback file (a grader's own material, not student work). */
export async function removeFeedbackFile(formData: FormData) {
  const user = await requireInstructor();
  const id = uuid.safeParse(formData.get("feedbackFileId"));
  if (!id.success) return;
  const [row] = await db
    .select({ fileId: schema.feedbackFiles.fileId, courseId: schema.assignments.courseId })
    .from(schema.feedbackFiles)
    .innerJoin(schema.submissions, eq(schema.submissions.id, schema.feedbackFiles.submissionId))
    .innerJoin(schema.assignments, eq(schema.assignments.id, schema.submissions.assignmentId))
    .where(eq(schema.feedbackFiles.id, id.data));
  if (!row) return;
  const course = await courseForInstructor(user, row.courseId, "grade.edit");
  await db.transaction(async (tx) => {
    await tx.delete(schema.feedbackFiles).where(eq(schema.feedbackFiles.id, id.data));
    await tx.delete(schema.files).where(eq(schema.files.id, row.fileId));
  });
  await audit(user.id, "feedback_file_removed", `${course.code} ${course.term}: file ${row.fileId}`);
  refresh();
}

/* --------------------------------- quizzes --------------------------------- */

/** A fixed question in a quiz; `position` is its place among questions AND random slots. */
const quizQuestionInput = questionFields
  .extend({ position: z.number().int().min(0).max(1000).optional(), bankQuestionId: optionalUuid.optional() })
  .superRefine(checkQuestion)
  .transform(({ position, bankQuestionId, ...q }) => ({ ...toQuestionColumns(q), position, bankQuestionId: bankQuestionId ?? null }));

/** "Random N questions from category X", each worth `points`. */
const slotInput = z.object({
  categoryId: uuid,
  pickCount: z.coerce.number().int().min(1, "Pick at least 1 question.").max(50),
  points: z.coerce.number().int().min(1).max(100).default(1),
  position: z.number().int().min(0).max(1000),
});

const quizInput = z.object({
  courseId: uuid,
  sectionId: optionalUuid,
  title: z.string().trim().min(1, "Enter a title.").max(160),
  description: z.string().trim().max(2000).optional(),
  timeLimitMinutes: z.coerce.number().int().min(1, "Time limit must be at least 1 minute.").max(300),
  // The browser converts datetime-local to ISO (UTC) so the server doesn't guess the zone.
  deadline: isoDate("Choose a valid deadline."),
  opensAt: z
    .string()
    .nullish()
    .transform((s) => s || null)
    .pipe(z.iso.datetime({ message: "Choose a valid opening time." }).transform((s) => new Date(s)).nullable()),
  shuffle: z.boolean().default(true),
  maxAttempts: z.coerce.number().int().min(1, "Allow at least 1 attempt.").max(MAX_ATTEMPTS, `At most ${MAX_ATTEMPTS} attempts.`).default(1),
  gradingMethod: z.enum(GRADING_METHODS).default("highest"),
  questions: z.array(quizQuestionInput).max(150).default([]),
  slots: z.array(slotInput).max(20).default([]),
});

export type QuizDraft = z.input<typeof quizInput>;
type ParsedQuestions = z.output<typeof quizInput>["questions"];
type ParsedSlots = z.output<typeof quizInput>["slots"];
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function contentProblem(questions: ParsedQuestions, slots: ParsedSlots): string | null {
  if (questions.length + slots.length === 0) return "Add at least one question.";
  const cats = slots.map((s) => s.categoryId);
  if (new Set(cats).size !== cats.length) return "Use one random slot per category (set how many questions it picks instead).";
  return null;
}

function timingProblem(quiz: { opensAt: Date | null; deadline: Date }): string | null {
  if (quiz.opensAt && quiz.opensAt.getTime() >= quiz.deadline.getTime()) return "The quiz must open before its deadline.";
  return null;
}

/**
 * Writes a quiz's fixed questions and random slots. Each slot's pool is COPIED from the
 * course's question bank (a snapshot: later bank edits never change this quiz once a
 * student has started). Returns an error message instead of writing if a slot asks for
 * more questions than its category has. Call inside the transaction that locks the quiz.
 */
async function writeQuizContent(tx: Tx, courseId: string, quizId: string, questions: ParsedQuestions, slots: ParsedSlots): Promise<string | null> {
  const bq = schema.bankQuestions;
  // Provenance links are kept only for this course's own bank questions.
  const claimed = questions.map((q) => q.bankQuestionId).filter((id): id is string => Boolean(id));
  const ownBank = new Set(
    claimed.length
      ? (await tx.select({ id: bq.id }).from(bq).where(and(eq(bq.courseId, courseId), inArray(bq.id, claimed)))).map((r) => r.id)
      : [],
  );

  const pools: { slot: ParsedSlots[number]; name: string; pool: (typeof bq.$inferSelect)[] }[] = [];
  for (const slot of slots) {
    const category = await tx.query.questionCategories.findFirst({ where: (c, { and, eq }) => and(eq(c.id, slot.categoryId), eq(c.courseId, courseId)) });
    if (!category) return "A random slot uses a category that no longer exists in this course's question bank.";
    // A question already in the quiz as a fixed question isn't also drawn at random.
    const pool = (await tx.select().from(bq).where(and(eq(bq.courseId, courseId), eq(bq.categoryId, category.id)))).filter((q) => !ownBank.has(q.id));
    if (slot.pickCount > pool.length)
      return `"${category.name}" has ${pool.length} question${pool.length === 1 ? "" : "s"} available, so a random slot can't pick ${slot.pickCount}.`;
    pools.push({ slot, name: category.name, pool });
  }

  if (questions.length) {
    await tx.insert(schema.questions).values(
      questions.map(({ position, bankQuestionId, ...q }, i) => ({
        ...q,
        quizId,
        position: position ?? i,
        bankQuestionId: bankQuestionId && ownBank.has(bankQuestionId) ? bankQuestionId : null,
      })),
    );
  }
  for (const { slot, name, pool } of pools) {
    const [row] = await tx
      .insert(schema.quizSlots)
      .values({ quizId, position: slot.position, categoryId: slot.categoryId, categoryName: name, pickCount: slot.pickCount, points: slot.points })
      .returning({ id: schema.quizSlots.id });
    await tx.insert(schema.questions).values(
      pool.map((b) => ({
        quizId,
        slotId: row.id,
        position: slot.position,
        bankQuestionId: b.id,
        type: b.type,
        prompt: b.prompt,
        options: b.options,
        correctIndex: b.correctIndex,
        correctIndexes: b.correctIndexes,
        acceptedAnswers: b.acceptedAnswers,
        numericAnswer: b.numericAnswer,
        tolerance: b.tolerance,
        explanation: b.explanation,
        // Every pick is worth the slot's points, so all attempts have the same total.
        points: slot.points,
      })),
    );
  }
  return null;
}

class QuizContentError extends Error {}

export async function createQuiz(draft: QuizDraft): Promise<FormState> {
  const parsed = quizInput.safeParse(draft);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { course } = await ownCourse(parsed.data.courseId);
  const quiz = parsed.data;
  if (quiz.deadline.getTime() <= Date.now()) return { error: "The deadline must be in the future." };
  const problem = contentProblem(quiz.questions, quiz.slots) ?? timingProblem(quiz);
  if (problem) return { error: problem };
  const sectionId = await checkSection(course.id, quiz.sectionId);

  let quizId: string;
  try {
    quizId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.quizzes)
        .values({
          courseId: course.id,
          sectionId,
          title: quiz.title,
          description: quiz.description || null,
          timeLimitMinutes: quiz.timeLimitMinutes,
          deadline: quiz.deadline,
          opensAt: quiz.opensAt,
          shuffle: quiz.shuffle,
          maxAttempts: quiz.maxAttempts,
          gradingMethod: quiz.gradingMethod,
        })
        .returning({ id: schema.quizzes.id });
      const error = await writeQuizContent(tx, course.id, row.id, quiz.questions, quiz.slots);
      if (error) throw new QuizContentError(error); // rolls back the quiz row too
      return row.id;
    });
  } catch (err) {
    if (err instanceof QuizContentError) return { error: err.message };
    throw err;
  }

  const opens = quiz.opensAt && quiz.opensAt.getTime() > Date.now() ? ` · opens ${formatDateTime(quiz.opensAt)}` : "";
  await notifyCourse(course.id, {
    title: `${course.code}: new quiz`,
    body: `${quiz.title} · ${quiz.timeLimitMinutes} min${opens} · due ${formatDateTime(quiz.deadline)}`,
    link: `/student/quizzes/${quizId}`,
  });
  redirect(`/instructor/quizzes/${quizId}`);
}

const quizUpdate = quizInput.omit({ courseId: true, questions: true, slots: true }).extend({
  id: uuid,
  // Omitted = keep the current questions and slots (they are locked once anyone started).
  questions: quizInput.shape.questions.optional(),
  slots: quizInput.shape.slots.optional(),
});

/**
 * Edits a quiz. What may change depends on what students have already done:
 * - Before anyone starts: everything, including the questions, random slots and answer key.
 * - After someone starts: title, description, section, shuffle, opening time, deadline,
 *   attempts allowed (never below an attempt already made) and the grading method.
 *   Changing questions or the time limit mid-way would make attempts unfair.
 * - After the deadline: the deadline is fixed, because the answer key is already visible.
 */
export async function updateQuiz(draft: z.input<typeof quizUpdate>): Promise<FormState> {
  const parsed = quizUpdate.safeParse(draft);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const user = await requireInstructor();
  const q = parsed.data;
  const existing = await db.query.quizzes.findFirst({ where: (x, { eq }) => eq(x.id, q.id) });
  if (!existing) return { error: "Quiz not found." };
  const course = await courseForInstructor(user, existing.courseId);

  const deadlineChanged = existing.deadline.getTime() !== q.deadline.getTime();
  if (deadlineChanged && existing.deadline.getTime() <= Date.now())
    return { error: "The deadline has passed and students can already see the answers, so it can't be changed." };
  if (deadlineChanged && q.deadline.getTime() <= Date.now()) return { error: "The new deadline must be in the future." };
  const replacing = q.questions !== undefined || q.slots !== undefined;
  const problem = (replacing ? contentProblem(q.questions ?? [], q.slots ?? []) : null) ?? timingProblem(q);
  if (problem) return { error: problem };

  const sectionId = await checkSection(course.id, q.sectionId);
  let result: FormState | null;
  try {
    result = await db.transaction(async (tx) => {
      // Exclusive lock on the quiz: startAttempt takes a shared lock on it, so no student can
      // start (and snapshot the old questions) while we decide and replace them.
      await tx.select({ id: schema.quizzes.id }).from(schema.quizzes).where(eq(schema.quizzes.id, existing.id)).for("update");
      // Checked inside the transaction, right before any question is replaced.
      const started = await tx.$count(schema.attempts, eq(schema.attempts.quizId, existing.id));
      if (started > 0 && replacing) return { error: `Questions are locked because ${started} student${started === 1 ? " has" : "s have"} started this quiz.` };
      if (started > 0 && q.timeLimitMinutes !== existing.timeLimitMinutes) return { error: "The time limit is locked once students have started." };
      const [{ used }] = await tx
        .select({ used: sql<number>`coalesce(max(${schema.attempts.attemptNumber}), 0)`.mapWith(Number) })
        .from(schema.attempts)
        .where(eq(schema.attempts.quizId, existing.id));
      if (q.maxAttempts < used) return { error: `A student has already made ${used} attempts, so the limit can't be lower than that.` };

      await tx
        .update(schema.quizzes)
        .set({
          title: q.title,
          description: q.description || null,
          sectionId,
          timeLimitMinutes: q.timeLimitMinutes,
          deadline: q.deadline,
          opensAt: q.opensAt,
          shuffle: q.shuffle,
          maxAttempts: q.maxAttempts,
          gradingMethod: q.gradingMethod,
        })
        .where(eq(schema.quizzes.id, existing.id));
      if (replacing) {
        // Pool questions reference their slot, so they go first.
        await tx.delete(schema.questions).where(eq(schema.questions.quizId, existing.id));
        await tx.delete(schema.quizSlots).where(eq(schema.quizSlots.quizId, existing.id));
        const error = await writeQuizContent(tx, course.id, existing.id, q.questions ?? [], q.slots ?? []);
        if (error) throw new QuizContentError(error);
      }
      return null;
    });
  } catch (err) {
    if (err instanceof QuizContentError) return { error: err.message };
    throw err;
  }
  if (result) return result;

  if (deadlineChanged)
    await notifyCourse(course.id, { title: `${course.code}: quiz deadline changed`, body: `${q.title} · now due ${formatDateTime(q.deadline)}`, link: `/student/quizzes/${existing.id}` });
  redirect(`/instructor/quizzes/${existing.id}`);
}

/** Drafts questions with the local AI model. The instructor reviews them before publishing. */
export async function aiDraftQuestions(input: { courseId: string; material: string; count: number }): Promise<{ questions?: GeneratedQuestion[]; error?: string }> {
  const { user, course } = await ownCourse(input.courseId);
  if (!aiEnabled()) return { error: "AI is not configured on this server." };
  const material = z.string().trim().min(50, "Paste at least a paragraph of material.").max(12_000).safeParse(input.material);
  if (!material.success) return { error: firstIssue(material.error) };
  if (!(await rateLimit(`ai-gen:${user.id}`, 15, 60 * 60_000))) return { error: "AI limit reached (15 per hour)." };
  try {
    const count = Math.min(Math.max(Math.trunc(input.count) || 5, 1), 15);
    return { questions: await generateQuestions(material.data, count, `${course.code} ${course.title}`) };
  } catch (err) {
    console.error("AI generation failed", err);
    return { error: "The AI model didn't return usable questions. Try again or shorten the material." };
  }
}

/* ------------------------------- live classes ------------------------------- */

const liveInput = z.object({
  courseId: uuid,
  sectionId: optionalUuid,
  title: z.string().trim().min(1, "Enter a topic.").max(160),
  startsAt: isoDate("Choose a start time."),
  durationMinutes: z.coerce.number().int().min(10).max(240),
});

export async function scheduleLive(input: z.input<typeof liveInput>): Promise<FormState> {
  const parsed = liveInput.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { course } = await ownCourse(parsed.data.courseId);
  const live = parsed.data;
  if (live.startsAt.getTime() < Date.now() - 5 * 60_000) return { error: "The start time is in the past." };
  // Long random room name: Jitsi rooms are public to anyone who knows the name.
  const room = `eduWave-${randomBytes(12).toString("base64url").replace(/[-_]/g, "x")}`;
  await db.insert(schema.liveSessions).values({ ...live, courseId: course.id, sectionId: await checkSection(course.id, live.sectionId), room });
  await notifyCourse(course.id, { title: `${course.code}: live class scheduled`, body: `${live.title} · ${formatDateTime(live.startsAt)}`, link: `/student/courses/${course.id}` });
  refresh();
  return { success: "Live class scheduled. Students have been notified." };
}
