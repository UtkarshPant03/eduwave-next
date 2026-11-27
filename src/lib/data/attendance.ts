/**
 * Attendance module: read queries. Callers must have authorised the user for the course.
 */
import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { attendancePercent, type AttendanceCounts, type AttendanceStatus, emptyCounts } from "@/lib/attendance";

const { attendanceSessions, attendanceRecords, attendanceCorrections, enrollments, users, classSections, batches, studentSections, courses } = schema;

export async function attendanceSettingsFor(courseId: string) {
  const row = await db.query.attendanceSettings.findFirst({ where: (s, { eq }) => eq(s.courseId, courseId) });
  return { thresholdPercent: row?.thresholdPercent ?? null, lateCreditPercent: row?.lateCreditPercent ?? 100 };
}

/** Sessions of a course, newest first, with how many of each status were marked. */
export function listAttendanceSessions(courseId: string) {
  const r = attendanceRecords;
  return db
    .select({
      id: attendanceSessions.id,
      heldAt: attendanceSessions.heldAt,
      topic: attendanceSessions.topic,
      section: sql<string | null>`${batches.name} || ' – ' || ${classSections.name}`,
      present: sql<number>`count(*) filter (where ${r.status} = 'present')`.mapWith(Number),
      late: sql<number>`count(*) filter (where ${r.status} = 'late')`.mapWith(Number),
      absent: sql<number>`count(*) filter (where ${r.status} = 'absent')`.mapWith(Number),
      excused: sql<number>`count(*) filter (where ${r.status} = 'excused')`.mapWith(Number),
    })
    .from(attendanceSessions)
    .leftJoin(r, eq(r.sessionId, attendanceSessions.id))
    .leftJoin(classSections, eq(classSections.id, attendanceSessions.sectionId))
    .leftJoin(batches, eq(batches.id, classSections.batchId))
    .where(eq(attendanceSessions.courseId, courseId))
    .groupBy(attendanceSessions.id, batches.name, classSections.name)
    .orderBy(desc(attendanceSessions.heldAt));
}

/**
 * A session with its roster: the course's enrolled students, narrowed to the session's
 * class section (for the course's term) when it has one, plus their current marks.
 */
export async function sessionRoster(sessionId: string) {
  const session = await db.query.attendanceSessions.findFirst({ where: (s, { eq }) => eq(s.id, sessionId) });
  if (!session) return null;
  const course = await db.query.courses.findFirst({ where: (c, { eq }) => eq(c.id, session.courseId), columns: { termId: true } });
  const inSection =
    session.sectionId && course?.termId
      ? sql`exists (select 1 from ${studentSections} ss where ss.student_id = ${users.id} and ss.section_id = ${session.sectionId} and ss.term_id = ${course.termId})`
      : undefined;
  const roster = await db
    .select({ id: users.id, name: users.name, studentId: users.studentId, status: attendanceRecords.status })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.userId))
    .leftJoin(attendanceRecords, and(eq(attendanceRecords.sessionId, session.id), eq(attendanceRecords.studentId, users.id)))
    .where(and(eq(enrollments.courseId, session.courseId), eq(users.role, "student"), inSection))
    .orderBy(asc(users.studentId), asc(users.name));
  return { session, roster };
}

/** Per-student totals for a course (aggregated in SQL), with the percentage. */
export async function courseAttendanceSummary(courseId: string) {
  const settings = await attendanceSettingsFor(courseId);
  const r = attendanceRecords;
  const rows = await db
    .select({
      studentId: users.id,
      name: users.name,
      universityId: users.studentId,
      present: sql<number>`count(${r.status}) filter (where ${r.status} = 'present')`.mapWith(Number),
      late: sql<number>`count(${r.status}) filter (where ${r.status} = 'late')`.mapWith(Number),
      absent: sql<number>`count(${r.status}) filter (where ${r.status} = 'absent')`.mapWith(Number),
      excused: sql<number>`count(${r.status}) filter (where ${r.status} = 'excused')`.mapWith(Number),
    })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.userId))
    .leftJoin(attendanceSessions, eq(attendanceSessions.courseId, enrollments.courseId))
    .leftJoin(r, and(eq(r.sessionId, attendanceSessions.id), eq(r.studentId, users.id)))
    .where(and(eq(enrollments.courseId, courseId), eq(users.role, "student")))
    .groupBy(users.id, users.name, users.studentId)
    .orderBy(asc(users.studentId), asc(users.name));
  return {
    settings,
    rows: rows.map((row) => ({ ...row, percent: attendancePercent(row, settings.lateCreditPercent) })),
  };
}

/** One student's attendance in a course, newest first, with any open correction request. */
export async function studentAttendance(courseId: string, studentId: string) {
  const settings = await attendanceSettingsFor(courseId);
  const rows = await db
    .select({
      sessionId: attendanceSessions.id,
      heldAt: attendanceSessions.heldAt,
      topic: attendanceSessions.topic,
      status: attendanceRecords.status,
      pending: sql<AttendanceStatus | null>`(select c.requested_status from attendance_corrections c where c.session_id = ${attendanceSessions.id} and c.student_id = ${studentId} and c.status = 'pending')`,
    })
    .from(attendanceSessions)
    .innerJoin(attendanceRecords, and(eq(attendanceRecords.sessionId, attendanceSessions.id), eq(attendanceRecords.studentId, studentId)))
    .where(eq(attendanceSessions.courseId, courseId))
    .orderBy(desc(attendanceSessions.heldAt));
  const counts: AttendanceCounts = emptyCounts();
  for (const r of rows) counts[r.status] += 1;
  return { settings, rows, counts, percent: attendancePercent(counts, settings.lateCreditPercent) };
}

/** Open correction requests for a course (oldest first). */
export function pendingCorrections(courseId: string) {
  const c = attendanceCorrections;
  return db
    .select({
      id: c.id,
      reason: c.reason,
      requestedStatus: c.requestedStatus,
      requestedAt: c.requestedAt,
      heldAt: attendanceSessions.heldAt,
      topic: attendanceSessions.topic,
      student: users.name,
      universityId: users.studentId,
      currentStatus: attendanceRecords.status,
    })
    .from(c)
    .innerJoin(attendanceSessions, eq(attendanceSessions.id, c.sessionId))
    .innerJoin(users, eq(users.id, c.studentId))
    .leftJoin(attendanceRecords, and(eq(attendanceRecords.sessionId, c.sessionId), eq(attendanceRecords.studentId, c.studentId)))
    .where(and(eq(attendanceSessions.courseId, courseId), eq(c.status, "pending")))
    .orderBy(asc(c.requestedAt));
}

export function courseOfSession(sessionId: string) {
  return db
    .select({ courseId: attendanceSessions.courseId, code: courses.code })
    .from(attendanceSessions)
    .innerJoin(courses, eq(courses.id, attendanceSessions.courseId))
    .where(eq(attendanceSessions.id, sessionId))
    .then((r) => r[0] ?? null);
}

