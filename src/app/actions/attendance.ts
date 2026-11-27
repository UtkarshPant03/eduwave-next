"use server";

/**
 * Attendance module: Server Actions.
 * - Staff with attendance.mark (instructors, coordinators, teaching assistants) take attendance.
 * - Staff with attendance.approve (instructors, coordinators) decide correction requests.
 * - Students may only request a correction of their own mark.
 * History is written by a database trigger on every mark and change (docs/DATABASE.md).
 */
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { courseForInstructor, courseForStudent } from "@/lib/access";
import { requireInstructor, requireStudent } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/auth/throttle";
import { courseOfSession, sessionRoster } from "@/lib/data/attendance";
import { isUniqueViolation } from "@/lib/db-errors";
import { firstIssue, type FormState } from "@/lib/form";
import { notifyUser } from "@/lib/notify";

const uuid = z.uuid();
const status = z.enum(["present", "absent", "late", "excused"]);

/* ------------------------------ settings ------------------------------ */

const settingsInput = z.object({
  courseId: uuid,
  // Empty = no minimum configured (the university policy isn't assumed).
  thresholdPercent: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(0).max(100).nullable()),
  lateCreditPercent: z.coerce.number().int().min(0).max(100),
});

export async function updateAttendanceSettings(_: FormState, formData: FormData): Promise<FormState> {
  const p = settingsInput.safeParse(Object.fromEntries(formData));
  if (!p.success) return { error: firstIssue(p.error) };
  const user = await requireInstructor();
  const course = await courseForInstructor(user, p.data.courseId, "course.manage");
  await db
    .insert(schema.attendanceSettings)
    .values({ courseId: course.id, thresholdPercent: p.data.thresholdPercent, lateCreditPercent: p.data.lateCreditPercent })
    .onConflictDoUpdate({
      target: schema.attendanceSettings.courseId,
      set: { thresholdPercent: p.data.thresholdPercent, lateCreditPercent: p.data.lateCreditPercent, updatedAt: sql`now()` },
    });
  refresh();
  return { success: "Attendance settings saved." };
}

/* ------------------------------ taking attendance ------------------------------ */

const sessionInput = z.object({
  courseId: uuid,
  // The browser sends ISO (UTC), converted from datetime-local in the user's own zone.
  heldAt: z.iso.datetime({ message: "Choose the date and time of the class." }).transform((s) => new Date(s)),
  topic: z.string().trim().max(200).optional(),
  sectionId: z.string().optional().transform((v) => v || null).pipe(uuid.nullable()),
});

/** Starts a class meeting and opens its attendance sheet. */
export async function createAttendanceSession(input: z.input<typeof sessionInput>): Promise<FormState> {
  const p = sessionInput.safeParse(input);
  if (!p.success) return { error: firstIssue(p.error) };
  const user = await requireInstructor();
  const course = await courseForInstructor(user, p.data.courseId, "attendance.mark");
  if (p.data.sectionId) {
    const linked = await db.query.courseSections.findFirst({ where: (s, { and, eq }) => and(eq(s.courseId, course.id), eq(s.sectionId, p.data.sectionId!)) });
    if (!linked) return { error: "That section isn't linked to this course." };
  }
  const [row] = await db
    .insert(schema.attendanceSessions)
    .values({ courseId: course.id, sectionId: p.data.sectionId, heldAt: p.data.heldAt, topic: p.data.topic || null, createdBy: user.id })
    .returning({ id: schema.attendanceSessions.id });
  redirect(`/instructor/courses/${course.id}/attendance/${row.id}`);
}

const sheetInput = z.object({
  sessionId: uuid,
  entries: z.array(z.object({ studentId: uuid, status })).max(2000),
});

/** Saves an attendance sheet in one transaction. Only students on the session's roster. */
export async function saveAttendance(input: z.input<typeof sheetInput>): Promise<{ error?: string; saved?: number }> {
  const p = sheetInput.safeParse(input);
  if (!p.success) return { error: firstIssue(p.error) };
  const user = await requireInstructor();
  const owner = await courseOfSession(p.data.sessionId);
  if (!owner) return { error: "Session not found." };
  await courseForInstructor(user, owner.courseId, "attendance.mark");
  const roster = await sessionRoster(p.data.sessionId);
  const allowed = new Set(roster?.roster.map((r) => r.id));
  const entries = p.data.entries.filter((e) => allowed.has(e.studentId));
  if (entries.length !== p.data.entries.length) return { error: "Some students aren't on this session's roster." };

  await db.transaction(async (tx) => {
    for (const e of entries) {
      await tx
        .insert(schema.attendanceRecords)
        .values({ sessionId: p.data.sessionId, studentId: e.studentId, status: e.status, markedBy: user.id, note: "marked" })
        .onConflictDoUpdate({
          target: [schema.attendanceRecords.sessionId, schema.attendanceRecords.studentId],
          set: { status: e.status, markedBy: user.id, markedAt: sql`now()`, note: "changed" },
          // Unchanged marks aren't rewritten, so the history only shows real changes.
          setWhere: sql`${schema.attendanceRecords.status} <> ${e.status}`,
        });
    }
  });
  refresh();
  return { saved: entries.length };
}

/* ------------------------------ corrections ------------------------------ */

const correctionInput = z.object({
  sessionId: uuid,
  requestedStatus: status,
  reason: z.string().trim().min(5, "Explain why (at least a few words).").max(1000),
});

/** A student asks for their own mark to be corrected. */
export async function requestCorrection(_: FormState, formData: FormData): Promise<FormState> {
  const p = correctionInput.safeParse(Object.fromEntries(formData));
  if (!p.success) return { error: firstIssue(p.error) };
  const user = await requireStudent();
  if (!(await rateLimit(`attendance-correction:${user.id}`, 10, 60 * 60_000))) return { error: "Too many requests. Try again later." };
  const owner = await courseOfSession(p.data.sessionId);
  if (!owner) return { error: "Session not found." };
  await courseForStudent(user, owner.courseId);
  const record = await db.query.attendanceRecords.findFirst({
    where: (r, { and, eq }) => and(eq(r.sessionId, p.data.sessionId), eq(r.studentId, user.id)),
  });
  if (!record) return { error: "There's no mark to correct for this class." };
  if (record.status === p.data.requestedStatus) return { error: "That's already your recorded status." };
  try {
    await db.insert(schema.attendanceCorrections).values({ sessionId: p.data.sessionId, studentId: user.id, requestedStatus: p.data.requestedStatus, reason: p.data.reason });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "You already have an open request for this class." };
    throw err;
  }
  refresh();
  return { success: "Request sent to your instructor." };
}

/** Staff decide a correction request. Approval changes the record (and the history logs it). */
export async function decideCorrection(correctionId: string, approve: boolean, note?: string): Promise<{ error?: string }> {
  const id = uuid.parse(correctionId);
  const approved = z.boolean().parse(approve);
  const decisionNote = z.string().trim().max(500).optional().parse(note) || null;
  const user = await requireInstructor();
  const pending = await db.query.attendanceCorrections.findFirst({ where: (c, { eq }) => eq(c.id, id) });
  if (!pending) return { error: "Request not found." };
  const owner = await courseOfSession(pending.sessionId);
  if (!owner) return { error: "Request not found." };
  await courseForInstructor(user, owner.courseId, "attendance.approve");

  const result = await db.transaction(async (tx) => {
    // Lock the request: two staff deciding at once can't both apply it.
    const [c] = await tx.select().from(schema.attendanceCorrections).where(eq(schema.attendanceCorrections.id, id)).for("update");
    if (!c || c.status !== "pending") return "This request has already been decided.";
    if (approved) {
      await tx
        .update(schema.attendanceRecords)
        .set({ status: c.requestedStatus, markedBy: user.id, markedAt: sql`now()`, note: `correction approved: ${c.reason}`.slice(0, 1000) })
        .where(and(eq(schema.attendanceRecords.sessionId, c.sessionId), eq(schema.attendanceRecords.studentId, c.studentId)));
    }
    await tx
      .update(schema.attendanceCorrections)
      .set({ status: approved ? "approved" : "rejected", decidedBy: user.id, decidedAt: sql`now()`, decisionNote })
      .where(eq(schema.attendanceCorrections.id, id));
    return null;
  });
  if (result) return { error: result };
  await notifyUser(pending.studentId, {
    title: `${owner.code}: attendance correction ${approved ? "approved" : "not approved"}`,
    body: decisionNote ?? undefined,
    link: `/student/courses/${owner.courseId}`,
  });
  refresh();
  return {};
}
