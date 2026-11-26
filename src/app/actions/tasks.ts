"use server";

import { refresh } from "next/cache";
import { and, eq, not } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { redirect } from "next/navigation";

// Personal to-do list, shared by teachers and students.
// Every query is scoped by userId, so nobody can touch someone else's tasks.

async function requireUserId() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user.id;
}

export async function addTask(formData: FormData) {
  const userId = await requireUserId();
  const text = z.string().trim().min(1).max(200).safeParse(formData.get("text"));
  if (!text.success) return;
  await db.insert(schema.tasks).values({ userId, text: text.data });
  refresh();
}

export async function toggleTask(formData: FormData) {
  const userId = await requireUserId();
  const id = z.uuid().parse(formData.get("taskId"));
  await db
    .update(schema.tasks)
    .set({ done: not(schema.tasks.done) })
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.userId, userId)));
  refresh();
}

export async function deleteTask(formData: FormData) {
  const userId = await requireUserId();
  const id = z.uuid().parse(formData.get("taskId"));
  await db.delete(schema.tasks).where(and(eq(schema.tasks.id, id), eq(schema.tasks.userId, userId)));
  refresh();
}
