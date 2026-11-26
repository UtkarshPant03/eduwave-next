/**
 * Data Access Layer: the single place that answers "who is making this request?".
 *
 * Every page and every Server Action calls requireTeacher()/requireStudent().
 * Hiding a button in the UI is not security; these checks are.
 */
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { readSessionUserId } from "./session";
import { db } from "@/db";

export type CurrentUser = {
  id: string;
  name: string;
  role: "teacher" | "student";
  classId: string | null;
};

// React's cache() de-duplicates the lookup within one request.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const userId = await readSessionUserId();
  if (!userId) return null;

  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, userId),
    // Never select passwordHash into objects that might reach the client.
    columns: { id: true, name: true, role: true, classId: true },
  });
  return user ?? null;
});

export async function requireTeacher(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/student");
  return user;
}

export async function requireStudent(): Promise<CurrentUser & { classId: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "student") redirect("/teacher");
  if (!user.classId) redirect("/login?error=no-class");
  return { ...user, classId: user.classId };
}
