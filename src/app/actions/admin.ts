"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { eq, inArray, or } from "drizzle-orm";
import Papa from "papaparse";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { revokeAllSessions } from "@/lib/auth/session";
import { clearFailures } from "@/lib/auth/throttle";
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
  // 1. Validate every row, and catch duplicates inside the file itself.
  const valid: { row: number; data: z.infer<typeof userInput> }[] = [];
  const seenEmail = new Set<string>();
  const seenSid = new Set<string>();
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
    const { email, studentId } = parsed.data;
    if (seenEmail.has(email) || (studentId && seenSid.has(studentId))) {
      result.errors.push(`Row ${i + 2}: ${email} appears more than once in this file.`);
      continue;
    }
    seenEmail.add(email);
    if (studentId) seenSid.add(studentId);
    valid.push({ row: i + 2, data: parsed.data });
  }

  // 2. One query for accounts that already exist (instead of one failed insert per row).
  const existing = valid.length
    ? await db
        .select({ email: schema.users.email, studentId: schema.users.studentId })
        .from(schema.users)
        .where(
          or(
            inArray(schema.users.email, valid.map((v) => v.data.email)),
            inArray(schema.users.studentId, valid.flatMap((v) => (v.data.studentId ? [v.data.studentId] : []))),
          ),
        )
    : [];
  const takenEmail = new Set(existing.map((e) => e.email));
  const takenSid = new Set(existing.flatMap((e) => (e.studentId ? [e.studentId] : [])));
  const fresh = valid.filter((v) => {
    const taken = takenEmail.has(v.data.email) || (v.data.studentId != null && takenSid.has(v.data.studentId));
    if (taken) result.errors.push(`Row ${v.row}: ${v.data.email} or its student ID already exists.`);
    return !taken;
  });

  // 3. Hash (bcrypt is deliberately slow: ~0.25 s per user, so 1,000 rows take a few minutes),
  //    then insert in batches of 100. onConflictDoNothing still guards against a race.
  for (let b = 0; b < fresh.length; b += 100) {
    const batch = fresh.slice(b, b + 100);
    const prepared = [];
    for (const v of batch) {
      const password = generateTempPassword();
      prepared.push({ v, password, values: { ...v.data, mustChangePassword: true, passwordHash: await hashPassword(password) } });
    }
    const inserted = await db
      .insert(schema.users)
      .values(prepared.map((p) => p.values))
      .onConflictDoNothing()
      .returning({ email: schema.users.email });
    const ok = new Set(inserted.map((r) => r.email));
    for (const p of prepared) {
      if (ok.has(p.v.data.email)) result.created.push({ name: p.v.data.name, email: p.v.data.email, studentId: p.v.data.studentId, password: p.password });
      else result.errors.push(`Row ${p.v.row}: ${p.v.data.email} or its student ID already exists.`);
    }
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
  // A reset is also how an administrator unlocks an account that was locked out.
  await clearFailures("account", id);
  await audit(id, "password_reset", undefined, admin.id);
  return { password };
}

export async function setUserActive(userId: string, isActive: boolean) {
  const admin = await requireAdmin();
  const id = z.uuid().parse(userId);
  const active = z.boolean().parse(isActive);
  if (id === admin.id) return { error: "You can't deactivate your own account." };
  await db.update(schema.users).set({ active }).where(eq(schema.users.id, id));
  // Deactivation must take effect immediately, not when the session expires.
  if (!active) await revokeAllSessions(id);
  await audit(id, active ? "user_reactivated" : "user_deactivated", undefined, admin.id);
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

export async function setCoursePublished(courseId: string, isPublished: boolean) {
  const admin = await requireAdmin();
  const published = z.boolean().parse(isPublished);
  const [course] = await db
    .update(schema.courses)
    .set({ published })
    .where(eq(schema.courses.id, z.uuid().parse(courseId)))
    .returning({ code: schema.courses.code, term: schema.courses.term });
  if (course) await audit(admin.id, published ? "course_published" : "course_hidden", `${course.code} ${course.term}`);
  refresh();
}
