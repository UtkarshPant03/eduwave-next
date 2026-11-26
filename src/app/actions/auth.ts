"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit, clientIp } from "@/lib/audit";
import { homeFor, requireUser } from "@/lib/auth/dal";
import { burnTime, hashPassword, passwordSchema, verifyPassword } from "@/lib/auth/password";
import { createSession, deleteSession, revokeOtherSessions } from "@/lib/auth/session";
import { clearFailures, lockedUntil, recordFailure } from "@/lib/auth/throttle";
import { firstIssue, type FormState } from "@/lib/form";
import { formatTime } from "@/lib/format";

const GENERIC_LOGIN_ERROR = "Incorrect email/ID or password.";

const loginInput = z.object({
  identifier: z.string().trim().min(1, "Enter your email or student ID.").max(200),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

/** Only allow redirects to our own role paths (prevents open-redirect phishing via ?next=). */
function safeNext(next: string | undefined, role: string) {
  return next && new RegExp(`^/${role}(/[\\w\\-/]*)?$`).test(next) ? next : null;
}

/**
 * One login for every role. Accepts an email, or a student ID for students.
 * Flow: lockout check -> look up user -> constant-time-ish password check -> session.
 */
export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { password } = parsed.data;
  const byEmail = parsed.data.identifier.includes("@");
  const identifier = byEmail ? parsed.data.identifier.toLowerCase() : parsed.data.identifier.toUpperCase();
  const ip = await clientIp();

  const locked = (await lockedUntil("account", identifier)) ?? (await lockedUntil("ip", ip));
  if (locked) return { error: `Too many failed attempts. Try again after ${formatTime(locked)}.` };

  const user = await db.query.users.findFirst({
    where: (u, { eq }) => (byEmail ? eq(u.email, identifier) : eq(u.studentId, identifier)),
  });
  const ok = user ? await verifyPassword(password, user.passwordHash) : (await burnTime(password), false);

  if (!user || !ok || !user.active) {
    await Promise.all([recordFailure("account", identifier), recordFailure("ip", ip)]);
    await audit(user?.id ?? null, "login_failed", user && !user.active ? `${identifier} (deactivated)` : identifier);
    if (await lockedUntil("account", identifier)) await audit(user?.id ?? null, "login_locked", identifier);
    // Same message for unknown, wrong-password and deactivated, so accounts can't be enumerated.
    return { error: GENERIC_LOGIN_ERROR };
  }

  await clearFailures("account", identifier);
  await createSession(user.id);
  await db.update(schema.users).set({ lastLoginAt: sql`now()` }).where(eq(schema.users.id, user.id));
  await audit(user.id, "login");
  if (user.mustChangePassword) redirect(`/${user.role}/account?required=1`);
  redirect(safeNext(parsed.data.next, user.role) ?? homeFor(user));
}

const changePasswordInput = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, "The new passwords don't match.")
  .refine((d) => d.newPassword !== d.currentPassword, "Choose a password different from the current one.");

export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = changePasswordInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const row = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, user.id) });
  if (!row || !(await verifyPassword(parsed.data.currentPassword, row.passwordHash))) {
    return { error: "Your current password is incorrect." };
  }

  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(parsed.data.newPassword), mustChangePassword: false })
    .where(eq(schema.users.id, user.id));
  // Anyone who knew the old password is now signed out everywhere else.
  await revokeOtherSessions(user.id);
  await audit(user.id, "password_changed");

  if (user.mustChangePassword) redirect(homeFor(user));
  return { success: "Password changed. Other devices have been signed out." };
}

const profileInput = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(100),
  department: z.string().trim().max(100).optional(),
  program: z.string().trim().max(100).optional(),
  bio: z.string().trim().max(500).optional(),
});

export async function updateProfile(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = profileInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { name, department, program, bio } = parsed.data;
  await db
    .update(schema.users)
    .set({ name, department: department || null, program: program || null, bio: bio || null })
    .where(eq(schema.users.id, user.id));
  refresh();
  return { success: "Profile updated." };
}

export async function signOutOtherDevices() {
  const user = await requireUser();
  await revokeOtherSessions(user.id);
  await audit(user.id, "sessions_revoked");
  refresh();
}

export async function logout() {
  const user = await requireUser().catch(() => null);
  if (user) await audit(user.id, "logout");
  await deleteSession();
  redirect("/login");
}
