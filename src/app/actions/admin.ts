"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import Papa from "papaparse";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { revokeAllSessions } from "@/lib/auth/session";
import { COURSE_COLORS } from "@/lib/course-colors";
import { firstIssue, type FormState } from "@/lib/form";

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((s) => s || null);

const userInput = z
  .object({
    role: z.enum(["admin", "instructor", "student"]),
    name: z.string().trim().min(2, "Enter a name.").max(100),
    email: z.email("Enter a valid email.").trim().toLowerCase(),
    studentId: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .transform((s) => s || null)
      .refine((s) => s === null || /^[A-Z0-9-]{3,20}$/.test(s), "Student ID: 3-20 letters, digits or dashes."),
    department: optional(100),
    program: optional(100),
  })
  .refine((u) => u.role !== "student" || u.studentId, { message: "Students need a student ID.", path: ["studentId"] });

/**
 * Admins provision accounts (no public sign-up, as at most universities). The server
 * generates a temporary password, shows it once, and the user must change it at first login.
 */
export async function createUser(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = userInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const u = parsed.data;
  const password = generateTempPassword();
  const inserted = await db
    .insert(schema.users)
    .values({ ...u, studentId: u.role === "student" ? u.studentId : null, mustChangePassword: true, passwordHash: await hashPassword(password) })
    .onConflictDoNothing()
    .returning({ id: schema.users.id });
  if (!inserted.length) return { error: "That email or student ID is already in use." };
  await audit(admin.id, "user_created", `${u.role} ${u.email}`);
  refresh();
  return { success: `Created ${u.name}. Temporary password: ${password} (shown once; they'll choose their own at first login).` };
}

export type ImportResult = { created: { name: string; email: string; studentId: string | null; password: string }[]; errors: string[] };

/** CSV columns: name, email, studentId, role (default student), department, program. */
export async function importUsers(csv: string): Promise<ImportResult> {
  const admin = await requireAdmin();
  if (csv.length > 500_000) return { created: [], errors: ["File too large (max 500 KB)."] };
  const { data } = Papa.parse<Record<string, string>>(csv.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/[^a-z]/g, ""),
  });
  if (data.length > 1000) return { created: [], errors: ["At most 1000 users per import."] };

  const result: ImportResult = { created: [], errors: [] };
  for (const [i, raw] of data.entries()) {
    const parsed = userInput.safeParse({
      role: (raw.role || "student").toLowerCase(),
      name: raw.name,
      email: raw.email,
      studentId: raw.studentid ?? raw.rollnumber ?? "",
      department: raw.department ?? "",
      program: raw.program ?? "",
    });
    if (!parsed.success) {
      result.errors.push(`Row ${i + 2}: ${firstIssue(parsed.error)}`);
      continue;
    }
    const password = generateTempPassword();
    const inserted = await db
      .insert(schema.users)
      .values({ ...parsed.data, mustChangePassword: true, passwordHash: await hashPassword(password) })
      .onConflictDoNothing()
      .returning({ id: schema.users.id });
    if (!inserted.length) result.errors.push(`Row ${i + 2}: ${parsed.data.email} or its student ID already exists.`);
    else result.created.push({ name: parsed.data.name, email: parsed.data.email, studentId: parsed.data.studentId, password });
  }
  await audit(admin.id, "user_created", `CSV import: ${result.created.length} users`);
  refresh();
  return result;
}

export async function resetUserPassword(userId: string): Promise<{ password?: string; error?: string }> {
  const admin = await requireAdmin();
  const id = z.uuid().parse(userId);
  const password = generateTempPassword();
  const updated = await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: true })
    .where(eq(schema.users.id, id))
    .returning({ email: schema.users.email });
  if (!updated.length) return { error: "User not found." };
  await revokeAllSessions(id);
  await audit(id, "password_reset", `by admin ${admin.email}`);
  return { password };
}

export async function setUserActive(userId: string, active: boolean) {
  const admin = await requireAdmin();
  const id = z.uuid().parse(userId);
  if (id === admin.id) return { error: "You can't deactivate your own account." };
  await db.update(schema.users).set({ active }).where(eq(schema.users.id, id));
  // Deactivation must take effect immediately, not when the session expires.
  if (!active) await revokeAllSessions(id);
  await audit(id, active ? "user_reactivated" : "user_deactivated", `by admin ${admin.email}`);
  refresh();
  return {};
}

const courseInput = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,5}\s?\d{2,4}[A-Z]?$/, "Course code like CS201 or MATH 110."),
  title: z.string().trim().min(3, "Enter a title.").max(120),
  department: z.string().trim().min(2, "Enter a department.").max(100),
  term: z.string().trim().min(3, "Enter a term, e.g. Spring 2027.").max(40),
  credits: z.coerce.number().int().min(0).max(12),
  instructorId: z.uuid("Choose an instructor."),
  description: optional(2000),
  color: z.enum(COURSE_COLORS).default("indigo"),
  weeks: z.coerce.number().int().min(0).max(20).default(0),
});

export async function createCourse(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = courseInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { weeks, ...course } = parsed.data;
  const instructor = await db.query.users.findFirst({ where: (u, { and, eq }) => and(eq(u.id, course.instructorId), eq(u.role, "instructor")) });
  if (!instructor) return { error: "Choose a valid instructor." };

  const id = await db.transaction(async (tx) => {
    const [row] = await tx.insert(schema.courses).values(course).onConflictDoNothing().returning({ id: schema.courses.id });
    if (!row) return null;
    if (weeks > 0) {
      await tx.insert(schema.sections).values(Array.from({ length: weeks }, (_, i) => ({ courseId: row.id, position: i, title: `Week ${i + 1}` })));
    }
    return row.id;
  });
  if (!id) return { error: `${course.code} already exists for ${course.term}.` };
  await audit(admin.id, "course_created", `${course.code} ${course.term}`);
  redirect(`/admin/courses`);
}

export async function setCoursePublished(courseId: string, published: boolean) {
  await requireAdmin();
  await db.update(schema.courses).set({ published }).where(eq(schema.courses.id, z.uuid().parse(courseId)));
  refresh();
}
