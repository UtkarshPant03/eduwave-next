"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { burnTime, hashPassword, verifyPassword } from "@/lib/auth/password";
import { allowAttempt, resetAttempts } from "@/lib/auth/rate-limit";
import { createSession, deleteSession } from "@/lib/auth/session";
import { firstIssue, type FormState } from "@/lib/form";

const GENERIC_LOGIN_ERROR = "Incorrect login details.";

const teacherLogin = z.object({
  email: z.email("Enter a valid email.").trim().toLowerCase(),
  password: z.string().min(1, "Enter your password."),
});

const studentLogin = z.object({
  rollNumber: z.string().trim().toUpperCase().min(1, "Enter your roll number."),
  password: z.string().min(1, "Enter your password."),
});

export async function loginTeacher(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = teacherLogin.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { email, password } = parsed.data;

  if (!allowAttempt(`teacher:${email}`)) return { error: "Too many attempts. Try again in 15 minutes." };

  const user = await db.query.users.findFirst({
    where: (u, { and, eq }) => and(eq(u.email, email), eq(u.role, "teacher")),
  });
  // Same message whether the account exists or not, so emails can't be enumerated.
  if (!user) {
    await burnTime(password);
    return { error: GENERIC_LOGIN_ERROR };
  }
  if (!(await verifyPassword(password, user.passwordHash))) return { error: GENERIC_LOGIN_ERROR };

  resetAttempts(`teacher:${email}`);
  await createSession(user.id);
  redirect("/teacher");
}

export async function loginStudent(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = studentLogin.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { rollNumber, password } = parsed.data;

  if (!allowAttempt(`student:${rollNumber}`)) return { error: "Too many attempts. Try again in 15 minutes." };

  const user = await db.query.users.findFirst({
    where: (u, { and, eq }) => and(eq(u.rollNumber, rollNumber), eq(u.role, "student")),
  });
  if (!user) {
    await burnTime(password);
    return { error: GENERIC_LOGIN_ERROR };
  }
  if (!(await verifyPassword(password, user.passwordHash))) return { error: GENERIC_LOGIN_ERROR };

  resetAttempts(`student:${rollNumber}`);
  await createSession(user.id);
  redirect("/student");
}

const teacherSignup = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(100),
  email: z.email("Enter a valid email.").trim().toLowerCase(),
  password: z.string().min(10, "Password must be at least 10 characters.").max(200),
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
  if (inviteCode !== expected) return { error: "Invalid invite code." };

  const inserted = await db
    .insert(schema.users)
    .values({ role: "teacher", name, email, passwordHash: await hashPassword(password) })
    .onConflictDoNothing()
    .returning({ id: schema.users.id });
  if (inserted.length === 0) return { error: "An account with this email already exists." };

  await createSession(inserted[0].id);
  redirect("/teacher");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
