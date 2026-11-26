"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { and, eq } from "drizzle-orm";
import Papa from "papaparse";
import { z } from "zod";
import { db, schema } from "@/db";
import { aiEnabled, generateQuestions, type GeneratedQuestion } from "@/lib/ai";
import { audit } from "@/lib/audit";
import { requireTeacher } from "@/lib/auth/dal";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { revokeAllSessions } from "@/lib/auth/session";
import { rateLimit } from "@/lib/auth/throttle";
import { getTeacherClass } from "@/lib/data";
import { firstIssue, type FormState } from "@/lib/form";
import { formatDateTime } from "@/lib/format";
import { notifyClass } from "@/lib/notify";
import { checkUpload } from "@/lib/uploads";

const uuid = z.uuid();

/* ------------------------------ classes ------------------------------ */

const classInput = z.object({ name: z.string().trim().min(1, "Enter a class name.").max(60) });

export async function createClass(_: FormState, formData: FormData): Promise<FormState> {
  const teacher = await requireTeacher();
  const parsed = classInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const inserted = await db
    .insert(schema.classes)
    .values({ name: parsed.data.name, teacherId: teacher.id })
    .onConflictDoNothing()
    .returning({ id: schema.classes.id });
  if (inserted.length === 0) return { error: "You already have a class with that name." };

  refresh();
  return { success: `Created ${parsed.data.name}.` };
}

export async function deleteClass(formData: FormData) {
  const teacher = await requireTeacher();
  const classId = uuid.parse(formData.get("classId"));
  await getTeacherClass(teacher.id, classId);
  await db.delete(schema.classes).where(eq(schema.classes.id, classId));
  redirect("/teacher");
}

/* ------------------------------ students ------------------------------ */

const rollNumber = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{2,20}$/, "Roll number: 2-20 letters, digits or dashes.");
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .transform((s) => s || undefined)
  .pipe(z.email("Enter a valid email or leave it blank.").optional());

const studentInput = z.object({
  classId: uuid,
  name: z.string().trim().min(2, "Enter the student's name.").max(100),
  rollNumber,
  email: optionalEmail,
});

/**
 * Teachers never choose student passwords: the server generates a temporary one,
 * shows it once, and the student must replace it at first login.
 */
export async function addStudent(_: FormState, formData: FormData): Promise<FormState> {
  const teacher = await requireTeacher();
  const parsed = studentInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { classId, name, rollNumber, email } = parsed.data;
  await getTeacherClass(teacher.id, classId); // ownership check (404s otherwise)

  const password = generateTempPassword();
  const inserted = await db
    .insert(schema.users)
    .values({ role: "student", name, rollNumber, email, classId, mustChangePassword: true, passwordHash: await hashPassword(password) })
    .onConflictDoNothing()
    .returning({ id: schema.users.id });
  if (inserted.length === 0) return { error: `Roll number ${rollNumber}${email ? " or that email" : ""} is already in use.` };

  refresh();
  return { success: `Added ${name}. Temporary password: ${password} (shown once; they'll choose their own at first login).` };
}

export type ImportResult = {
  created: { name: string; rollNumber: string; password: string }[];
  errors: string[];
};

/** Bulk-adds students from CSV text with columns: name, rollNumber, email (optional). */
export async function importStudents(classId: string, csv: string): Promise<ImportResult> {
  const teacher = await requireTeacher();
  await getTeacherClass(teacher.id, uuid.parse(classId));
  if (csv.length > 200_000) return { created: [], errors: ["File too large (max 200 KB)."] };

  const { data } = Papa.parse<Record<string, string>>(csv.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/[^a-z]/g, ""),
  });
  if (data.length > 300) return { created: [], errors: ["At most 300 students per import."] };

  const result: ImportResult = { created: [], errors: [] };
  const row = studentInput.omit({ classId: true });
  for (const [i, raw] of data.entries()) {
    const parsed = row.safeParse({ name: raw.name, rollNumber: raw.rollnumber ?? raw.roll, email: raw.email ?? "" });
    if (!parsed.success) {
      result.errors.push(`Row ${i + 2}: ${firstIssue(parsed.error)}`);
      continue;
    }
    const password = generateTempPassword();
    const inserted = await db
      .insert(schema.users)
      .values({ role: "student", classId, mustChangePassword: true, passwordHash: await hashPassword(password), ...parsed.data })
      .onConflictDoNothing()
      .returning({ id: schema.users.id });
    if (inserted.length === 0) result.errors.push(`Row ${i + 2}: ${parsed.data.rollNumber} already exists.`);
    else result.created.push({ name: parsed.data.name, rollNumber: parsed.data.rollNumber, password });
  }
  refresh();
  return result;
}

export async function resetStudentPassword(classId: string, studentId: string): Promise<{ password?: string; error?: string }> {
  const teacher = await requireTeacher();
  await getTeacherClass(teacher.id, uuid.parse(classId));
  const password = generateTempPassword();
  const updated = await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: true })
    .where(and(eq(schema.users.id, uuid.parse(studentId)), eq(schema.users.classId, classId), eq(schema.users.role, "student")))
    .returning({ id: schema.users.id });
  if (updated.length === 0) return { error: "Student not found." };
  await revokeAllSessions(studentId);
  await audit(studentId, "password_reset_by_teacher", `by ${teacher.name}`);
  return { password };
}

export async function removeStudent(formData: FormData) {
  const teacher = await requireTeacher();
  const classId = uuid.parse(formData.get("classId"));
  const studentId = uuid.parse(formData.get("studentId"));
  await getTeacherClass(teacher.id, classId);
  await db
    .delete(schema.users)
    .where(and(eq(schema.users.id, studentId), eq(schema.users.classId, classId), eq(schema.users.role, "student")));
  refresh();
}

/* ------------------------------ quizzes ------------------------------ */

const questionInput = z
  .object({
    prompt: z.string().trim().min(1, "Every question needs text.").max(500),
    options: z.array(z.string().trim().min(1, "Options cannot be empty.").max(200)).min(2, "Each question needs at least 2 options.").max(6),
    correctIndex: z.number().int().min(0),
    explanation: z.string().trim().max(500).optional(),
  })
  .refine((q) => q.correctIndex < q.options.length, "Pick a correct option for every question.");

const quizInput = z.object({
  classId: uuid,
  title: z.string().trim().min(1, "Enter a title.").max(120),
  subject: z.string().trim().min(1, "Enter a subject.").max(60),
  timeLimitMinutes: z.coerce.number().int().min(1, "Time limit must be at least 1 minute.").max(300),
  // The browser converts datetime-local to ISO (UTC) so the server doesn't guess the zone.
  deadline: z.iso.datetime({ message: "Choose a valid deadline." }).transform((s) => new Date(s)),
  shuffle: z.boolean().default(true),
  questions: z.array(questionInput).min(1, "Add at least one question.").max(100),
});

export type QuizDraft = z.input<typeof quizInput>;

export async function createQuiz(draft: QuizDraft): Promise<FormState> {
  const teacher = await requireTeacher();
  const parsed = quizInput.safeParse(draft);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const quiz = parsed.data;
  if (quiz.deadline.getTime() <= Date.now()) return { error: "The deadline must be in the future." };
  await getTeacherClass(teacher.id, quiz.classId);

  const quizId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.quizzes)
      .values({
        classId: quiz.classId,
        title: quiz.title,
        subject: quiz.subject,
        timeLimitMinutes: quiz.timeLimitMinutes,
        deadline: quiz.deadline,
        shuffle: quiz.shuffle,
      })
      .returning({ id: schema.quizzes.id });
    await tx.insert(schema.questions).values(quiz.questions.map((q, position) => ({ quizId: row.id, position, ...q })));
    return row.id;
  });

  await notifyClass(quiz.classId, {
    title: `New quiz: ${quiz.title}`,
    body: `${quiz.subject} · ${quiz.timeLimitMinutes} min · due ${formatDateTime(quiz.deadline)}`,
    link: `/student/quizzes/${quizId}`,
  });
  redirect(`/teacher/quizzes/${quizId}`);
}

export async function deleteQuiz(formData: FormData) {
  const teacher = await requireTeacher();
  const quizId = uuid.parse(formData.get("quizId"));
  const quiz = await db.query.quizzes.findFirst({ where: (q, { eq }) => eq(q.id, quizId) });
  if (!quiz) return;
  await getTeacherClass(teacher.id, quiz.classId);
  await db.delete(schema.quizzes).where(eq(schema.quizzes.id, quizId));
  redirect(`/teacher/classes/${quiz.classId}`);
}

/** Drafts questions with the local AI model. The teacher reviews them before publishing. */
export async function aiDraftQuestions(input: {
  classId: string;
  material: string;
  count: number;
  subject: string;
}): Promise<{ questions?: GeneratedQuestion[]; error?: string }> {
  const teacher = await requireTeacher();
  if (!aiEnabled()) return { error: "AI is not configured on this server." };
  await getTeacherClass(teacher.id, uuid.parse(input.classId));
  const material = z.string().trim().min(50, "Paste at least a paragraph of material.").max(12_000).safeParse(input.material);
  if (!material.success) return { error: firstIssue(material.error) };
  if (!(await rateLimit(`ai-gen:${teacher.id}`, 15, 60 * 60_000))) return { error: "AI limit reached (15 per hour)." };

  try {
    const count = Math.min(Math.max(Math.trunc(input.count) || 5, 1), 15);
    return { questions: await generateQuestions(material.data, count, input.subject.slice(0, 60) || "General") };
  } catch (err) {
    console.error("AI generation failed", err);
    return { error: "The AI model didn't return usable questions. Try again or shorten the material." };
  }
}

/* ------------------------------ resources ------------------------------ */

const resourceInput = z.object({
  classId: uuid,
  title: z.string().trim().min(1, "Enter a title.").max(120),
  subject: z.string().trim().min(1, "Enter a subject.").max(60),
  kind: z.enum(["link", "file"]),
});
// Only http(s) links: blocks `javascript:` URLs that would run code when clicked.
const httpUrl = z.url({ protocol: /^https?$/, message: "Enter a full http(s) link." });

export async function addResource(_: FormState, formData: FormData): Promise<FormState> {
  const teacher = await requireTeacher();
  const parsed = resourceInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { classId, title, subject, kind } = parsed.data;
  await getTeacherClass(teacher.id, classId);

  if (kind === "link") {
    const url = httpUrl.safeParse(formData.get("url"));
    if (!url.success) return { error: firstIssue(url.error) };
    await db.insert(schema.resources).values({ classId, title, subject, url: url.data });
  } else {
    const file = formData.get("file");
    if (!(file instanceof File)) return { error: "Choose a file to upload." };
    const checked = await checkUpload(file);
    if ("error" in checked) return { error: checked.error };
    await db.transaction(async (tx) => {
      const [f] = await tx
        .insert(schema.files)
        .values({ classId, uploaderId: teacher.id, size: checked.data.length, ...checked })
        .returning({ id: schema.files.id });
      await tx.insert(schema.resources).values({ classId, title, subject, fileId: f.id });
    });
  }

  await notifyClass(classId, { title: `New resource: ${title}`, body: subject, link: "/student/resources" });
  refresh();
  return { success: "Resource shared with the class." };
}

export async function deleteResource(formData: FormData) {
  const teacher = await requireTeacher();
  const classId = uuid.parse(formData.get("classId"));
  const resourceId = uuid.parse(formData.get("resourceId"));
  await getTeacherClass(teacher.id, classId);
  const [deleted] = await db
    .delete(schema.resources)
    .where(and(eq(schema.resources.id, resourceId), eq(schema.resources.classId, classId)))
    .returning({ fileId: schema.resources.fileId });
  if (deleted?.fileId) await db.delete(schema.files).where(eq(schema.files.id, deleted.fileId));
  refresh();
}

/* ------------------------------ live classes ------------------------------ */

const liveInput = z.object({
  classId: uuid,
  title: z.string().trim().min(1, "Enter a title.").max(120),
  startsAt: z.iso.datetime({ message: "Choose a start time." }).transform((s) => new Date(s)),
  durationMinutes: z.coerce.number().int().min(10).max(240),
});

export async function scheduleLive(input: z.input<typeof liveInput>): Promise<FormState> {
  const teacher = await requireTeacher();
  const parsed = liveInput.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const live = parsed.data;
  if (live.startsAt.getTime() < Date.now() - 5 * 60_000) return { error: "The start time is in the past." };
  await getTeacherClass(teacher.id, live.classId);

  // Long random room name: Jitsi rooms are public to anyone who knows the name.
  const room = `eduWave-${randomBytes(12).toString("base64url").replace(/[-_]/g, "x")}`;
  await db.insert(schema.liveSessions).values({ ...live, room });
  await notifyClass(live.classId, {
    title: `Live class scheduled: ${live.title}`,
    body: formatDateTime(live.startsAt),
    link: "/student/live",
  });
  refresh();
  return { success: "Live class scheduled. Students have been notified." };
}

export async function cancelLive(formData: FormData) {
  const teacher = await requireTeacher();
  const id = uuid.parse(formData.get("liveId"));
  const live = await db.query.liveSessions.findFirst({ where: (l, { eq }) => eq(l.id, id) });
  if (!live) return;
  await getTeacherClass(teacher.id, live.classId);
  await db.delete(schema.liveSessions).where(eq(schema.liveSessions.id, id));
  refresh();
}
