/**
 * Data Access Layer: the single place that answers "who is making this request?".
 *
 * Every page and every Server Action calls requireTeacher()/requireStudent().
 * Hiding a button in the UI is not security; these checks are.
 */
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { readSessionUserId } from "./session";
import { db } from "@/db";

export type CurrentUser = {
  id: string;
  name: string;
  role: "teacher" | "student";
  classId: string | null;
  mustChangePassword: boolean;
};

// React's cache() de-duplicates the lookup within one request.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Everything authenticated is per-request. connection() stops (runtime) prerendering
  // here, so the session expiry check and the pages' clock reads happen at request time.
  await connection();
  const userId = await readSessionUserId();
  if (!userId) return null;

  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, userId),
    // Never select passwordHash into objects that might reach the client.
    columns: { id: true, name: true, role: true, classId: true, mustChangePassword: true },
  });
  return user ?? null;
});

/** Any signed-in user. Used by shared pages such as /account. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireTeacher(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "teacher") redirect("/student");
  if (user.mustChangePassword) redirect(`/${user.role}/account?required=1`);
  return user;
}

export async function requireStudent(): Promise<CurrentUser & { classId: string }> {
  const user = await requireUser();
  if (user.role !== "student") redirect("/teacher");
  // Students with a teacher-issued password must pick their own before anything else.
  if (user.mustChangePassword) redirect(`/${user.role}/account?required=1`);
  if (!user.classId) redirect("/login?error=no-class");
  return { ...user, classId: user.classId };
}

export const homeFor = (user: Pick<CurrentUser, "role">) => (user.role === "teacher" ? "/teacher" : "/student");
