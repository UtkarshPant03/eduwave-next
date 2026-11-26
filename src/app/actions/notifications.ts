"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth/dal";

const n = schema.notifications;

export async function markNotificationRead(id: string) {
  const user = await requireUser();
  await db
    .update(n)
    .set({ readAt: sql`now()` })
    .where(and(eq(n.id, z.uuid().parse(id)), eq(n.userId, user.id)));
}

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await db
    .update(n)
    .set({ readAt: sql`now()` })
    .where(and(eq(n.userId, user.id), isNull(n.readAt)));
}
