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

/**
 * Any signed-in user who has finished setting up their account. Used by shared pages and
 * actions (calendar, boards, discussions, tasks, notifications).
 *
 * Users holding an issued (temporary) password are sent to choose their own first. This
 * check lives here, not only in the role helpers, so a leaked temporary password can't be
 * used to reach shared pages, actions or downloads without the owner noticing.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await requireSignedIn();
  if (user.mustChangePassword) redirect(`/${user.role}/account?required=1`);
  return user;
}

/**
 * Signed in, even if the password still has to be changed. ONLY for the account page and
 * its own actions (change password, profile, sign out), which must work in that state.
 */
export async function requireSignedIn(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * For route handlers, which answer with a status code instead of redirecting:
 * returns null for signed-out users AND for users who must still change their password.
 */
export async function getActiveUser(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user && !user.mustChangePassword ? user : null;
}

async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== role) redirect(homeFor(user));
  return user;
}

export const requireAdmin = () => requireRole("admin");
export const requireInstructor = () => requireRole("instructor");
export const requireStudent = () => requireRole("student");
