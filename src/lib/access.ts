/**
 * Course-level authorisation: "may THIS user see/manage THIS course?"
 *
 * - The course's instructor manages it.
 * - Admins can view everything (and manage via the admin console).
 * - Enrolled students can view published courses.
 * Every helper 404s (not 403s) when access is denied, so course ids can't be probed.
 */
import "server-only";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CurrentUser } from "./auth/dal";

export type Course = typeof schema.courses.$inferSelect;

/** Instructor-owned course (admins also pass, for support). */
export async function courseForInstructor(user: CurrentUser, courseId: string): Promise<Course> {
  const course = await db.query.courses.findFirst({ where: (c, { eq }) => eq(c.id, courseId) });
  if (!course || (course.instructorId !== user.id && user.role !== "admin")) notFound();
  return course;
}

/** Published course the student is enrolled in. */
export async function courseForStudent(user: CurrentUser, courseId: string): Promise<Course> {
  const [row] = await db
    .select({ course: schema.courses })
    .from(schema.courses)
    .innerJoin(
      schema.enrollments,
      and(eq(schema.enrollments.courseId, schema.courses.id), eq(schema.enrollments.userId, user.id)),
    )
    .where(and(eq(schema.courses.id, courseId), eq(schema.courses.published, true)));
  if (!row) notFound();
  return row.course;
}

/** Either role: used by shared pages (discussions, files). */
export async function courseForMember(user: CurrentUser, courseId: string): Promise<{ course: Course; manager: boolean }> {
  if (user.role === "student") return { course: await courseForStudent(user, courseId), manager: false };
  return { course: await courseForInstructor(user, courseId), manager: true };
}

/** Non-throwing variant for route handlers. */
export async function canAccessCourse(user: CurrentUser, courseId: string): Promise<boolean> {
  try {
    await courseForMember(user, courseId);
    return true;
  } catch {
    return false;
  }
}
