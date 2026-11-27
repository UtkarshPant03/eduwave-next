"use server";

import { refresh } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth/dal";

// Personal to-do list, shared by every role.
// Every query is scoped by userId, so nobody can touch someone else's tasks.

const taskInput = z.object({
  text: z.string().trim().min(1).max(200),
  // <input type="date"> value, e.g. "2026-12-01"; stored as end of that day (UTC).
  dueDate: z
    .string()
    .optional()
    .transform((d) => (d ? new Date(`${d}T23:59:59Z`) : null))
    .refine((d) => d === null || !Number.isNaN(d.getTime()), "Invalid date"),
});

export async function addTask(input: { text: string; dueDate?: string }) {
  const user = await requireUser();
  const parsed = taskInput.safeParse(input);
  if (!parsed.success) return;
  await db.insert(schema.tasks).values({ userId: user.id, ...parsed.data });
  refresh();
}

export async function setTaskDone(taskId: string, done: boolean) {
  const user = await requireUser();
  await db
    .update(schema.tasks)
    .set({ done })
    .where(and(eq(schema.tasks.id, z.uuid().parse(taskId)), eq(schema.tasks.userId, user.id)));
  refresh();
}

export async function deleteTask(taskId: string) {
  const user = await requireUser();
  await db
    .delete(schema.tasks)
    .where(and(eq(schema.tasks.id, z.uuid().parse(taskId)), eq(schema.tasks.userId, user.id)));
  refresh();
}
