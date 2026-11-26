"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireTeacher } from "@/lib/auth/dal";
import { hashPassword } from "@/lib/auth/password";
import { getTeacherClass } from "@/lib/data";
import { firstIssue, type FormState } from "@/lib/form";

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

/* ------------------------------ students ------------------------------ */

const studentInput = z.object({
  classId: z.uuid(),
  name: z.string().trim().min(2, "Enter the student's name.").max(100),
  rollNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/, "Roll number: 2-20 letters, digits or dashes."),
  password: z.string().min(8, "Initial password must be at least 8 characters.").max(200),
});

export async function addStudent(_: FormState, formData: FormData): Promise<FormState> {
  const teacher = await requireTeacher();
  const parsed = studentInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { classId, name, rollNumber, password } = parsed.data;

  await getTeacherClass(teacher.id, classId); // ownership check (404s otherwise)

  const inserted = await db
    .insert(schema.users)
    .values({ role: "student", name, rollNumber, classId, passwordHash: await hashPassword(password) })
    .onConflictDoNothing()
    .returning({ id: schema.users.id });
  if (inserted.length === 0) return { error: `Roll number ${rollNumber} is already taken.` };

  refresh();
  return { success: `Added ${name} (${rollNumber}). Share the password with them privately.` };
}

export async function removeStudent(formData: FormData) {
  const teacher = await requireTeacher();
  const classId = z.uuid().parse(formData.get("classId"));
  const studentId = z.uuid().parse(formData.get("studentId"));
  await getTeacherClass(teacher.id, classId);

  await db
    .delete(schema.users)
    .where(and(eq(schema.users.id, studentId), eq(schema.users.classId, classId), eq(schema.users.role, "student")));
  refresh();
}

/* ------------------------------ quizzes ------------------------------ */

const quizInput = z.object({
  classId: z.uuid(),
  title: z.string().trim().min(1, "Enter a title.").max(120),
  subject: z.string().trim().min(1, "Enter a subject.").max(60),
  timeLimitMinutes: z.coerce.number().int().min(1, "Time limit must be at least 1 minute.").max(300),
  // <input type="datetime-local"> sends local time without a zone; the browser
  // converts it to ISO (UTC) before submitting so the server doesn't guess the zone.
  deadline: z.iso.datetime({ message: "Choose a valid deadline." }).transform((s) => new Date(s)),
  questions: z
    .array(
      z
        .object({
          prompt: z.string().trim().min(1, "Every question needs text.").max(500),
          options: z.array(z.string().trim().min(1, "Options cannot be empty.").max(200)).min(2).max(6),
          correctIndex: z.number().int().min(0),
        })
        .refine((q) => q.correctIndex < q.options.length, "Pick a correct option for every question."),
    )
    .min(1, "Add at least one question.")
    .max(100),
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
      })
      .returning({ id: schema.quizzes.id });
    await tx.insert(schema.questions).values(
      quiz.questions.map((q, position) => ({ quizId: row.id, position, ...q })),
    );
    return row.id;
  });

  // Email notifications (the original app's Nodemailer feature) belong here, sent
  // through a background job/queue so a slow mail server can't fail quiz creation.
  redirect(`/teacher/quizzes/${quizId}`);
}

export async function deleteQuiz(formData: FormData) {
  const teacher = await requireTeacher();
  const quizId = z.uuid().parse(formData.get("quizId"));
  const quiz = await db.query.quizzes.findFirst({ where: (q, { eq }) => eq(q.id, quizId) });
  if (!quiz) return;
  await getTeacherClass(teacher.id, quiz.classId);
  await db.delete(schema.quizzes).where(eq(schema.quizzes.id, quizId));
  redirect(`/teacher/classes/${quiz.classId}`);
}

/* ------------------------------ resources ------------------------------ */

const resourceInput = z.object({
  classId: z.uuid(),
  title: z.string().trim().min(1, "Enter a title.").max(120),
  subject: z.string().trim().min(1, "Enter a subject.").max(60),
  // Only http(s) links: blocks `javascript:` URLs that would run code when clicked.
  url: z.url({ protocol: /^https?$/, message: "Enter a full http(s) link." }),
});

export async function addResource(_: FormState, formData: FormData): Promise<FormState> {
  const teacher = await requireTeacher();
  const parsed = resourceInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  await getTeacherClass(teacher.id, parsed.data.classId);

  await db.insert(schema.resources).values(parsed.data);
  refresh();
  return { success: "Resource shared." };
}

export async function deleteResource(formData: FormData) {
  const teacher = await requireTeacher();
  const classId = z.uuid().parse(formData.get("classId"));
  const resourceId = z.uuid().parse(formData.get("resourceId"));
  await getTeacherClass(teacher.id, classId);
  await db
    .delete(schema.resources)
    .where(and(eq(schema.resources.id, resourceId), eq(schema.resources.classId, classId)));
  refresh();
}
