/**
 * Discussions and announcements.
 */
import "server-only";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { countOf, outer } from "./sql";

const { threads, posts, users, courses } = schema;

export function listThreads(courseId: string) {
  return db
    .select({
      id: threads.id,
      title: threads.title,
      body: threads.body,
      isAnnouncement: threads.isAnnouncement,
      pinned: threads.pinned,
      locked: threads.locked,
      createdAt: threads.createdAt,
      lastActivityAt: threads.lastActivityAt,
      author: users.name,
      authorRole: users.role,
      replies: countOf(sql`select count(*) from posts p where p.thread_id = ${outer("threads", "id")}`),
    })
    .from(threads)
    .innerJoin(users, eq(users.id, threads.authorId))
    .where(eq(threads.courseId, courseId))
    .orderBy(desc(threads.pinned), desc(threads.lastActivityAt));
}

/** Thread + replies. Caller must authorise access to `thread.courseId`. */
export async function getThread(threadId: string) {
  const [row] = await db
    .select({ t: threads, author: users.name, authorRole: users.role })
    .from(threads)
    .innerJoin(users, eq(users.id, threads.authorId))
    .where(eq(threads.id, threadId));
  if (!row) notFound();
  const replies = await db
    .select({ id: posts.id, body: posts.body, createdAt: posts.createdAt, authorId: posts.authorId, author: users.name, authorRole: users.role })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(eq(posts.threadId, threadId))
    .orderBy(asc(posts.createdAt));
  return { thread: { ...row.t, author: row.author, authorRole: row.authorRole }, replies };
}

/** Latest announcements across a set of courses (student dashboard feed). */
export function recentAnnouncements(courseIds: string[], limit = 5) {
  if (!courseIds.length) return Promise.resolve([]);
  return db
    .select({ id: threads.id, title: threads.title, body: threads.body, createdAt: threads.createdAt, courseId: courses.id, courseCode: courses.code, color: courses.color, author: users.name })
    .from(threads)
    .innerJoin(courses, eq(courses.id, threads.courseId))
    .innerJoin(users, eq(users.id, threads.authorId))
    .where(and(inArray(threads.courseId, courseIds), eq(threads.isAnnouncement, true)))
    .orderBy(desc(threads.createdAt))
    .limit(limit);
}
