/**
 * Per-user data used across roles: tasks, notifications, whiteboards, audit, files.
 */
import "server-only";
import { notFound } from "next/navigation";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CurrentUser } from "@/lib/auth/dal";
import { canAccessCourse } from "@/lib/access";

const { tasks, notifications, boards, users, auditLog, files, enrollments } = schema;

export function listTasks(userId: string) {
  return db
    .select({ id: tasks.id, text: tasks.text, done: tasks.done, dueDate: tasks.dueDate })
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(asc(tasks.done), sql`${tasks.dueDate} asc nulls last`, desc(tasks.createdAt));
}

export function listNotifications(userId: string, limit = 20) {
  return db
    .select({ id: notifications.id, title: notifications.title, body: notifications.body, link: notifications.link, readAt: notifications.readAt, createdAt: notifications.createdAt })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadCount(userId: string) {
  const [row] = await db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row.n;
}

/**
 * Courses a student can currently SEE: enrolled AND published. Everything shown to
 * students outside a course page (calendar, boards) must use this, not raw enrolments:
 * an instructor may be preparing a draft course that students are already enrolled in.
 */
export async function visibleCourseIds(userId: string) {
  const rows = await db
    .select({ id: enrollments.courseId })
    .from(enrollments)
    .innerJoin(schema.courses, eq(schema.courses.id, enrollments.courseId))
    .where(and(eq(enrollments.userId, userId), eq(schema.courses.published, true)));
  return rows.map((r) => r.id);
}

/** Ids of the courses a user is on the staff of (cheap: no per-course statistics). */
export async function taughtCourseIds(userId: string) {
  const rows = await db.select({ id: schema.courseStaff.courseId }).from(schema.courseStaff).where(eq(schema.courseStaff.userId, userId));
  return rows.map((r) => r.id);
}

/** Boards the user owns, plus boards shared with any course they're enrolled in. */
export async function listBoards(user: CurrentUser) {
  const courseIds = user.role === "student" ? await visibleCourseIds(user.id) : [];
  return db
    .select({ id: boards.id, title: boards.title, updatedAt: boards.updatedAt, ownerId: boards.ownerId, ownerName: users.name, sharedCourseId: boards.sharedCourseId })
    .from(boards)
    .innerJoin(users, eq(boards.ownerId, users.id))
    .where(courseIds.length ? or(eq(boards.ownerId, user.id), inArray(boards.sharedCourseId, courseIds)) : eq(boards.ownerId, user.id))
    .orderBy(desc(boards.updatedAt));
}

export async function getBoardForUser(user: CurrentUser, boardId: string) {
  const board = await db.query.boards.findFirst({ where: (b, { eq }) => eq(b.id, boardId) });
  if (!board) notFound();
  const isOwner = board.ownerId === user.id;
  if (!isOwner && !(board.sharedCourseId && user.role === "student" && (await canAccessCourse(user, board.sharedCourseId)))) notFound();
  return { board, readOnly: !isOwner };
}

export function listAuditLog(userId: string) {
  return db
    .select({ action: auditLog.action, detail: auditLog.detail, ip: auditLog.ip, createdAt: auditLog.createdAt })
    .from(auditLog)
    .where(eq(auditLog.userId, userId))
    .orderBy(desc(auditLog.createdAt))
    .limit(25);
}

/**
 * A file may be downloaded by members of its course. Assignment submission files are
 * additionally private: only the uploader and the course's staff may read them. Feedback
 * files: course staff, and the student whose submission they belong to once it is graded.
 */
export async function getFileForUser(user: CurrentUser, fileId: string) {
  // Authorise on the metadata first; read the (possibly large) contents only if allowed.
  const [meta] = await db
    .select({ id: files.id, courseId: files.courseId, uploaderId: files.uploaderId, uploaderRole: users.role })
    .from(files)
    .innerJoin(users, eq(users.id, files.uploaderId))
    .where(eq(files.id, fileId));
  if (!meta || !(await canAccessCourse(user, meta.courseId))) return null;
  if (user.role === "student" && meta.uploaderId !== user.id) {
    // Students may only read files that instructors attached to resources, and the
    // feedback files of their own graded submissions.
    const isResource = await db.query.resources.findFirst({ where: (r, { eq }) => eq(r.fileId, fileId), columns: { id: true } });
    if (!isResource) {
      const [ownFeedback] = await db
        .select({ id: schema.feedbackFiles.id })
        .from(schema.feedbackFiles)
        .innerJoin(schema.submissions, eq(schema.submissions.id, schema.feedbackFiles.submissionId))
        // Only once the assignment's grades are released (4.6), like the grade itself.
        .innerJoin(schema.assignments, eq(schema.assignments.id, schema.submissions.assignmentId))
        .where(
          and(
            eq(schema.feedbackFiles.fileId, fileId),
            eq(schema.submissions.studentId, user.id),
            isNotNull(schema.submissions.grade),
            eq(schema.assignments.gradesReleased, true),
          ),
        );
      if (!ownFeedback) return null;
    }
  }
  const file = await db.query.files.findFirst({ where: (f, { eq }) => eq(f.id, fileId) });
  return file ? { ...file, uploaderRole: meta.uploaderRole } : null;
}

export const fileMeta = { id: files.id, name: files.name, size: files.size, mimeType: files.mimeType };
