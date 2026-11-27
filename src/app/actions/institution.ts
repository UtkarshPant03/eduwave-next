"use server";

/**
 * Institution module: academic structure and course offerings' staff and sections.
 * Every action: admin only → validate → write (transaction where rows must agree) →
 * audit. Database rules (unique names, persona triggers, primary-instructor rule) are
 * the backstop; their errors are turned into clear messages here.
 */
import { refresh } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { isForeignKeyViolation, isIntegrityTrigger, isUniqueViolation } from "@/lib/db-errors";
import { firstIssue, type FormState } from "@/lib/form";

const uuid = z.uuid();
const name = (max = 120) => z.string().trim().min(1, "Enter a name.").max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);
const isoDate = z.iso.date("Enter a valid date.");

/** Runs an insert/update and maps database rule violations to messages. */
async function guarded(fn: () => Promise<unknown>, duplicate: string): Promise<FormState | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    if (isUniqueViolation(err)) return { error: duplicate };
    if (isIntegrityTrigger(err) || isForeignKeyViolation(err)) {
      const msg = (err as { cause?: { message?: string } }).cause?.message ?? (err as Error).message;
      return { error: msg.replace(/^.*?: /, "") };
    }
    throw err;
  }
}

const parse = <T extends z.ZodType>(schemaDef: T, formData: FormData) => schemaDef.safeParse(Object.fromEntries(formData));

/* ------------------------------ structure ------------------------------ */

export async function createDepartment(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const p = parse(z.object({ name: name(), code: optionalText(12) }), formData);
  if (!p.success) return { error: firstIssue(p.error) };
  const fail = await guarded(() => db.insert(schema.departments).values({ name: p.data.name, code: p.data.code?.toUpperCase() ?? null }), "A department with that name or code already exists.");
  if (fail) return fail;
  await audit(admin.id, "structure_changed", `department ${p.data.name}`);
  refresh();
  return { success: `Department "${p.data.name}" added.` };
}

export async function createProgramme(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const p = parse(z.object({ departmentId: uuid, name: name(), code: optionalText(20), semesters: z.coerce.number().int().min(1).max(16) }), formData);
  if (!p.success) return { error: firstIssue(p.error) };
  const fail = await guarded(() => db.insert(schema.programmes).values(p.data), "That department already has a programme with this name.");
  if (fail) return fail;
  await audit(admin.id, "structure_changed", `programme ${p.data.name}`);
  refresh();
  return { success: `Programme "${p.data.name}" added.` };
}

export async function createSession(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const p = parse(z.object({ name: name(40), startsOn: isoDate, endsOn: isoDate }), formData);
  if (!p.success) return { error: firstIssue(p.error) };
  if (p.data.endsOn <= p.data.startsOn) return { error: "The session must end after it starts." };
  const fail = await guarded(() => db.insert(schema.academicSessions).values(p.data), "An academic session with that name already exists.");
  if (fail) return fail;
  await audit(admin.id, "structure_changed", `session ${p.data.name}`);
  refresh();
  return { success: `Session "${p.data.name}" added.` };
}

export async function createTerm(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const p = parse(z.object({ sessionId: uuid, name: name(40), startsOn: isoDate, endsOn: isoDate }), formData);
  if (!p.success) return { error: firstIssue(p.error) };
  if (p.data.endsOn <= p.data.startsOn) return { error: "The term must end after it starts." };
  const fail = await guarded(() => db.insert(schema.terms).values(p.data), "That session already has a term with this name.");
  if (fail) return fail;
  await audit(admin.id, "structure_changed", `term ${p.data.name}`);
  refresh();
  return { success: `Term "${p.data.name}" added.` };
}

export async function createBatch(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const p = parse(z.object({ programmeId: uuid, intakeYear: z.coerce.number().int().min(1990).max(2200), name: name() }), formData);
  if (!p.success) return { error: firstIssue(p.error) };
  const fail = await guarded(() => db.insert(schema.batches).values(p.data), "That programme already has a batch for this intake year.");
  if (fail) return fail;
  await audit(admin.id, "structure_changed", `batch ${p.data.name}`);
  refresh();
  return { success: `Batch "${p.data.name}" added.` };
}

export async function createClassSection(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const p = parse(z.object({ batchId: uuid, name: name(20) }), formData);
  if (!p.success) return { error: firstIssue(p.error) };
  const fail = await guarded(() => db.insert(schema.classSections).values(p.data), "That batch already has a section with this name.");
  if (fail) return fail;
  await audit(admin.id, "structure_changed", `section ${p.data.name}`);
  refresh();
  return { success: `Section "${p.data.name}" added.` };
}

/**
 * Places students in a class section for a term (student IDs or emails, one per line).
 * A student has one section per term: assigning again moves them (history across terms
 * is kept because each term has its own row).
 */
export async function assignStudentsToSection(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const p = parse(z.object({ sectionId: uuid, termId: uuid, students: z.string().max(100_000) }), formData);
  if (!p.success) return { error: firstIssue(p.error) };
  const ids = [...new Set(p.data.students.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))].slice(0, 2000);
  if (ids.length === 0) return { error: "Paste at least one student ID or email." };
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
  const missing = ids.filter((raw) => {
    const key = raw.includes("@") ? raw.toLowerCase() : raw.toUpperCase();
    return !found.some((f) => f.email === key || f.studentId === key);
  });
  if (found.length) {
    await db
      .insert(schema.studentSections)
      .values(found.map((f) => ({ studentId: f.id, termId: p.data.termId, sectionId: p.data.sectionId })))
      .onConflictDoUpdate({ target: [schema.studentSections.studentId, schema.studentSections.termId], set: { sectionId: p.data.sectionId, assignedAt: sql`now()` } });
    await audit(admin.id, "structure_changed", `${found.length} student(s) placed in a section`);
  }
  refresh();
  const msg = `${found.length} student(s) placed.${missing.length ? ` Not found: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}` : ""}`;
  return found.length ? { success: msg } : { error: msg };
}

/* --------------------------- course offerings --------------------------- */

/** Links a course to a department and (optionally) a term; keeps the text fields in step. */
export async function updateCourseAcademic(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const p = parse(z.object({ courseId: uuid, departmentId: uuid, termId: z.string().optional().transform((v) => v || null).pipe(uuid.nullable()) }), formData);
  if (!p.success) return { error: firstIssue(p.error) };
  const dept = await db.query.departments.findFirst({ where: (d, { eq }) => eq(d.id, p.data.departmentId) });
  if (!dept) return { error: "Choose a department." };
  let termText: string | undefined;
  if (p.data.termId) {
    const [t] = await db
      .select({ label: sql<string>`${schema.academicSessions.name} || ' · ' || ${schema.terms.name}` })
      .from(schema.terms)
      .innerJoin(schema.academicSessions, eq(schema.academicSessions.id, schema.terms.sessionId))
      .where(eq(schema.terms.id, p.data.termId));
    if (!t) return { error: "Choose a term." };
    termText = t.label;
  }
  const fail = await guarded(
    () =>
      db
        .update(schema.courses)
        .set({ departmentId: dept.id, department: dept.name, termId: p.data.termId, ...(termText ? { term: termText } : {}) })
        .where(eq(schema.courses.id, p.data.courseId)),
    "Another course already uses this code in that term.",
  );
  if (fail) return fail;
  await audit(admin.id, "structure_changed", `course linked to ${dept.name}${termText ? `, ${termText}` : ""}`);
  refresh();
  return { success: "Academic details saved." };
}

const staffRole = z.enum(["coordinator", "instructor", "teaching_assistant"]);

export async function addCourseStaff(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const p = parse(z.object({ courseId: uuid, email: z.email("Enter the staff member's email.").toLowerCase(), role: staffRole }), formData);
  if (!p.success) return { error: firstIssue(p.error) };
  const user = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.email, p.data.email) });
  if (!user) return { error: "No account with that email." };
  if (user.role !== "instructor") return { error: "Course staff must have an instructor account." };
  const fail = await guarded(
    () =>
      db
        .insert(schema.courseStaff)
        .values({ courseId: p.data.courseId, userId: user.id, role: p.data.role })
        .onConflictDoUpdate({ target: [schema.courseStaff.courseId, schema.courseStaff.userId], set: { role: p.data.role } }),
    "That person is already on the course staff.",
  );
  if (fail) return fail;
  await audit(user.id, "course_staff_changed", `${p.data.role} on course ${p.data.courseId}`, admin.id);
  refresh();
  return { success: `${user.name} added as ${p.data.role.replace("_", " ")}.` };
}

export async function removeCourseStaff(courseId: string, userId: string): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  const c = uuid.parse(courseId);
  const u = uuid.parse(userId);
  // The database refuses to remove the primary instructor (trigger); say why.
  const fail = await guarded(
    () => db.delete(schema.courseStaff).where(and(eq(schema.courseStaff.courseId, c), eq(schema.courseStaff.userId, u))),
    "",
  );
  if (fail) return { error: "Make someone else the primary instructor first." };
  await audit(u, "course_staff_changed", `removed from course ${c}`, admin.id);
  refresh();
  return {};
}

export async function setPrimaryInstructor(courseId: string, userId: string): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  const c = uuid.parse(courseId);
  const u = uuid.parse(userId);
  const staff = await db.query.courseStaff.findFirst({ where: (s, { and, eq }) => and(eq(s.courseId, c), eq(s.userId, u)) });
  if (!staff || staff.role === "teaching_assistant") return { error: "The primary instructor must be an instructor or coordinator on this course." };
  await db.update(schema.courses).set({ instructorId: u }).where(eq(schema.courses.id, c));
  await audit(u, "course_staff_changed", `primary instructor of course ${c}`, admin.id);
  refresh();
  return {};
}

export async function linkCourseSection(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const p = parse(z.object({ courseId: uuid, sectionId: uuid }), formData);
  if (!p.success) return { error: firstIssue(p.error) };
  await db.insert(schema.courseSections).values(p.data).onConflictDoNothing();
  await audit(admin.id, "structure_changed", `section linked to course ${p.data.courseId}`);
  refresh();
  return { success: "Section linked." };
}

export async function unlinkCourseSection(courseId: string, sectionId: string) {
  const admin = await requireAdmin();
  await db
    .delete(schema.courseSections)
    .where(and(eq(schema.courseSections.courseId, uuid.parse(courseId)), eq(schema.courseSections.sectionId, uuid.parse(sectionId))));
  await audit(admin.id, "structure_changed", `section unlinked from course ${courseId}`);
  refresh();
}

/**
 * Enrols every student placed (for the course's term) in a section linked to the course.
 * One INSERT … SELECT; already-enrolled students are skipped. Nobody is unenrolled.
 */
export async function enrolLinkedSections(courseId: string): Promise<{ added?: number; error?: string }> {
  const admin = await requireAdmin();
  const c = uuid.parse(courseId);
  const course = await db.query.courses.findFirst({ where: (x, { eq }) => eq(x.id, c), columns: { id: true, termId: true, code: true, term: true } });
  if (!course) return { error: "Course not found." };
  if (!course.termId) return { error: "Link this course to a term first: section membership is recorded per term." };
  const added = await db.execute<{ user_id: string }>(sql`
    insert into enrollments (course_id, user_id)
    select ${c}, ss.student_id
    from student_sections ss
    join course_sections cs on cs.section_id = ss.section_id and cs.course_id = ${c}
    join users u on u.id = ss.student_id and u.active
    where ss.term_id = ${course.termId}
    on conflict do nothing
    returning user_id`);
  const n = Array.isArray(added) ? added.length : (added as { rows?: unknown[] }).rows?.length ?? 0;
  await audit(admin.id, "enrolment_added", `${course.code} ${course.term}: ${n} student(s) from linked sections`);
  refresh();
  return { added: n };
}
