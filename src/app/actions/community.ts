"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { courseForMember } from "@/lib/access";
import { requireUser } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/auth/throttle";
import { firstIssue, type FormState } from "@/lib/form";
import { notifyCourse, notifyUser } from "@/lib/notify";
import { plainText } from "@/components/markdown";

const uuid = z.uuid();

const threadInput = z.object({
  courseId: uuid,
  title: z.string().trim().min(3, "Give your post a title.").max(200),
  body: z.string().trim().min(1, "Write something.").max(20_000),
  announcement: z.literal("on").optional(),
});

export async function createThread(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = threadInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { course, manager } = await courseForMember(user, parsed.data.courseId);
  // Simple anti-spam: at most 10 new threads per user per hour.
  if (!(await rateLimit(`thread:${user.id}`, 10, 60 * 60_000))) return { error: "You're posting too fast. Try again later." };

  const isAnnouncement = manager && parsed.data.announcement === "on"; // only instructors can announce
  const [t] = await db
    .insert(schema.threads)
    .values({ courseId: course.id, authorId: user.id, title: parsed.data.title, body: parsed.data.body, isAnnouncement, pinned: isAnnouncement })
    .returning({ id: schema.threads.id });

  if (isAnnouncement) {
    await notifyCourse(course.id, { title: `${course.code} announcement: ${parsed.data.title}`, body: plainText(parsed.data.body).slice(0, 140), link: `/student/courses/${course.id}/discussions/${t.id}` }, user.id);
  }
  redirect(`/${user.role === "student" ? "student" : "instructor"}/courses/${course.id}/discussions/${t.id}`);
}

/** Loads a thread and checks the user belongs to its course. */
async function threadFor(threadId: unknown) {
  const user = await requireUser();
  const thread = await db.query.threads.findFirst({ where: (t, { eq }) => eq(t.id, uuid.parse(threadId)) });
  if (!thread) throw new Error("Thread not found");
  const { course, manager } = await courseForMember(user, thread.courseId);
  return { user, thread, course, manager };
}

export async function reply(_: FormState, formData: FormData): Promise<FormState> {
  const { user, thread, course } = await threadFor(formData.get("threadId"));
  const body = z.string().trim().min(1, "Write a reply.").max(20_000).safeParse(formData.get("body"));
  if (!body.success) return { error: firstIssue(body.error) };
  if (thread.locked) return { error: "This discussion is locked." };
  if (!(await rateLimit(`reply:${user.id}`, 60, 60 * 60_000))) return { error: "You're posting too fast. Try again later." };

  await db.insert(schema.posts).values({ threadId: thread.id, authorId: user.id, body: body.data });
  await db.update(schema.threads).set({ lastActivityAt: sql`now()` }).where(eq(schema.threads.id, thread.id));
  if (thread.authorId !== user.id) {
    const authorRole = (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, thread.authorId), columns: { role: true } }))?.role ?? "student";
    await notifyUser(thread.authorId, {
      title: `${user.name} replied in ${course.code}`,
      body: thread.title,
      link: `/${authorRole === "student" ? "student" : "instructor"}/courses/${course.id}/discussions/${thread.id}`,
    });
  }
  refresh();
  return { success: "Reply posted." };
}

/** Instructor moderation: pin / lock. */
export async function moderateThread(threadId: string, change: { pinned?: boolean; locked?: boolean }) {
  const { thread, manager } = await threadFor(threadId);
  if (!manager) return;
  await db.update(schema.threads).set(change).where(eq(schema.threads.id, thread.id));
  refresh();
}

/** Authors can delete their own thread; instructors can delete any thread in their course. */
export async function deleteThread(threadId: string) {
  const { user, thread, course, manager } = await threadFor(threadId);
  if (!manager && thread.authorId !== user.id) return;
  await db.delete(schema.threads).where(eq(schema.threads.id, thread.id));
  redirect(`/${user.role === "student" ? "student" : "instructor"}/courses/${course.id}#discussions`);
}

export async function deletePost(threadId: string, postId: string) {
  const { user, thread, manager } = await threadFor(threadId);
  const post = await db.query.posts.findFirst({ where: (p, { and, eq }) => and(eq(p.id, uuid.parse(postId)), eq(p.threadId, thread.id)) });
  if (!post || (!manager && post.authorId !== user.id)) return;
  await db.delete(schema.posts).where(and(eq(schema.posts.id, post.id)));
  refresh();
}
