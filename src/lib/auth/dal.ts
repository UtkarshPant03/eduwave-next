/**
 * Data Access Layer: the single place that answers "who is making this request?".
 *
 * Every page, Server Action and route handler calls one of the require* helpers.
 * Hiding a button in the UI is not security; these checks are.
 */
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { readSessionUserId } from "./session";
import { db } from "@/db";

export type Role = "admin" | "instructor" | "student";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
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
    columns: { id: true, name: true, email: true, role: true, mustChangePassword: true, active: true },
  });
  // A deactivated account loses access immediately, even with a valid session.
  if (!user || !user.active) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword };
});

export const homeFor = (user: Pick<CurrentUser, "role">) => `/${user.role}`;

/** Any signed-in user. Used by shared pages such as account settings. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== role) redirect(homeFor(user));
  // Users with an issued password must pick their own before anything else.
  if (user.mustChangePassword) redirect(`/${user.role}/account?required=1`);
  return user;
}

export const requireAdmin = () => requireRole("admin");
export const requireInstructor = () => requireRole("instructor");
export const requireStudent = () => requireRole("student");
