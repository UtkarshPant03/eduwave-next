/**
 * Per-user data used across roles: tasks, notifications, whiteboards, audit, files.
 */
import "server-only";
import { notFound } from "next/navigation";
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
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

export async function enrolledCourseIds(userId: string) {
  const rows = await db.select({ id: enrollments.courseId }).from(enrollments).where(eq(enrollments.userId, userId));
  return rows.map((r) => r.id);
}

/** Boards the user owns, plus boards shared with any course they're enrolled in. */
export async function listBoards(user: CurrentUser) {
  const courseIds = user.role === "student" ? await enrolledCourseIds(user.id) : [];
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
 * additionally private: only the uploader and the course's instructor may read them.
 */
export async function getFileForUser(user: CurrentUser, fileId: string) {
  const file = await db.query.files.findFirst({ where: (f, { eq }) => eq(f.id, fileId) });
  if (!file || !(await canAccessCourse(user, file.courseId))) return null;
  if (user.role === "student" && file.uploaderId !== user.id) {
    // Students may only read files that instructors attached to resources.
    const isResource = await db.query.resources.findFirst({ where: (r, { eq }) => eq(r.fileId, fileId) });
    if (!isResource) return null;
  }
  return file;
}

export const fileMeta = { id: files.id, name: files.name, size: files.size, mimeType: files.mimeType };
