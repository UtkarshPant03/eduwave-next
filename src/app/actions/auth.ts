"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit, clientIp } from "@/lib/audit";
import { homeFor, requireUser } from "@/lib/auth/dal";
import { burnTime, hashPassword, passwordSchema, verifyPassword } from "@/lib/auth/password";
import { createSession, deleteSession, revokeOtherSessions } from "@/lib/auth/session";
import { clearFailures, lockedUntil, recordFailure } from "@/lib/auth/throttle";
import { firstIssue, type FormState } from "@/lib/form";
import { formatTime } from "@/lib/format";

const GENERIC_LOGIN_ERROR = "Incorrect login details.";

const teacherLogin = z.object({
  email: z.email("Enter a valid email.").trim().toLowerCase(),
  password: z.string().min(1, "Enter your password."),
});

const studentLogin = z.object({
  rollNumber: z.string().trim().toUpperCase().min(1, "Enter your roll number."),
  password: z.string().min(1, "Enter your password."),
});

/**
 * Shared login flow for both roles:
 * lockout check -> look up user -> constant-time-ish password check -> session.
 */
async function login(
  role: "teacher" | "student",
  identifier: string,
  password: string,
  findUser: () => Promise<typeof schema.users.$inferSelect | undefined>,
): Promise<FormState> {
  const accountKey = `${role}:${identifier}`;
  const ip = await clientIp();

  const locked = (await lockedUntil("account", accountKey)) ?? (await lockedUntil("ip", ip));
  if (locked) {
    return { error: `Too many failed attempts. Try again after ${formatTime(locked)}.` };
  }

  const user = await findUser();
  const ok = user ? await verifyPassword(password, user.passwordHash) : (await burnTime(password), false);

  if (!user || !ok) {
    await Promise.all([recordFailure("account", accountKey), recordFailure("ip", ip)]);
    await audit(user?.id ?? null, "login_failed", `${role} ${identifier}`);
    if (await lockedUntil("account", accountKey)) await audit(user?.id ?? null, "login_locked", accountKey);
    // Same message whether the account exists or not, so accounts can't be enumerated.
    return { error: GENERIC_LOGIN_ERROR };
  }

  await clearFailures("account", accountKey);
  await createSession(user.id);
  await audit(user.id, "login");
  redirect(user.mustChangePassword ? "/account?required=1" : homeFor(user));
}

export async function loginTeacher(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = teacherLogin.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { email, password } = parsed.data;
  return login("teacher", email, password, () =>
    db.query.users.findFirst({ where: (u, { and, eq }) => and(eq(u.email, email), eq(u.role, "teacher")) }),
  );
}

export async function loginStudent(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = studentLogin.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { rollNumber, password } = parsed.data;
  return login("student", rollNumber, password, () =>
    db.query.users.findFirst({ where: (u, { and, eq }) => and(eq(u.rollNumber, rollNumber), eq(u.role, "student")) }),
  );
}

const teacherSignup = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(100),
  email: z.email("Enter a valid email.").trim().toLowerCase(),
  password: passwordSchema,
  inviteCode: z.string().trim(),
});

/**
 * Teacher registration requires an invite code (TEACHER_INVITE_CODE in .env).
 * In the original app anyone could register as a teacher and email whole classes.
 */
export async function registerTeacher(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = teacherSignup.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { name, email, password, inviteCode } = parsed.data;

  const expected = process.env.TEACHER_INVITE_CODE;
  if (!expected) return { error: "Teacher registration is disabled on this server." };
  // Invite-code guessing goes through the same IP throttle as logins.
  const ip = await clientIp();
  if (await lockedUntil("ip", ip)) return { error: "Too many attempts. Try again later." };
  if (inviteCode !== expected) {
    await recordFailure("ip", ip);
    return { error: "Invalid invite code." };
  }

  const inserted = await db
    .insert(schema.users)
    .values({ role: "teacher", name, email, passwordHash: await hashPassword(password) })
    .onConflictDoNothing()
    .returning({ id: schema.users.id });
  if (inserted.length === 0) return { error: "An account with this email already exists." };

  await audit(inserted[0].id, "teacher_registered");
  await createSession(inserted[0].id);
  redirect("/teacher");
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
