"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { courseForInstructor } from "@/lib/access";

const MAX_SCENE_BYTES = 2_000_000; // embedded images count towards this

export async function createBoard(formData: FormData) {
  const user = await requireUser();
  const title = z.string().trim().min(1).max(80).catch("Untitled board").parse(formData.get("title"));
  const [board] = await db
    .insert(schema.boards)
    .values({ ownerId: user.id, title, scene: { elements: [] } })
    .returning({ id: schema.boards.id });
  redirect(`/${user.role}/boards/${board.id}`);
}

const sceneInput = z.object({
  boardId: z.uuid(),
  elements: z.array(z.unknown()).max(20_000),
  files: z.record(z.string(), z.unknown()).optional(),
});

/** Autosave from the whiteboard. Only the owner can write. */
export async function saveBoard(input: z.input<typeof sceneInput>): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const parsed = sceneInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid drawing data." };
  const { boardId, elements, files } = parsed.data;
  if (JSON.stringify({ elements, files }).length > MAX_SCENE_BYTES) {
    return { ok: false, error: "Board is too large (2 MB). Remove some images." };
  }
  const updated = await db
    .update(schema.boards)
    .set({ scene: { elements, files }, updatedAt: sql`now()` })
    .where(and(eq(schema.boards.id, boardId), eq(schema.boards.ownerId, user.id)))
    .returning({ id: schema.boards.id });
  return updated.length ? { ok: true } : { ok: false, error: "You can't edit this board." };
}

export async function renameBoard(boardId: string, title: string) {
  const user = await requireUser();
  const clean = z.string().trim().min(1).max(80).parse(title);
  await db
    .update(schema.boards)
    .set({ title: clean })
    .where(and(eq(schema.boards.id, z.uuid().parse(boardId)), eq(schema.boards.ownerId, user.id)));
}

/** Instructors can share a board read-only with one of their courses (or stop sharing). */
export async function shareBoard(boardId: string, courseId: string | null) {
  const user = await requireUser();
  if (user.role !== "instructor") return;
  if (courseId) await courseForInstructor(user, z.uuid().parse(courseId));
  await db
    .update(schema.boards)
    .set({ sharedCourseId: courseId })
    .where(and(eq(schema.boards.id, z.uuid().parse(boardId)), eq(schema.boards.ownerId, user.id)));
  refresh();
}

export async function deleteBoard(formData: FormData) {
  const user = await requireUser();
  const id = z.uuid().parse(formData.get("boardId"));
  await db.delete(schema.boards).where(and(eq(schema.boards.id, id), eq(schema.boards.ownerId, user.id)));
  redirect(`/${user.role}/boards`);
}
