/**
 * Course-level authorisation: "may THIS user do X in THIS course?"
 *
 * - Course staff (course_staff: coordinator, instructor, teaching assistant) act within
 *   the capabilities of their role (src/lib/auth/capabilities.ts).
 * - Admins can view everything (and manage via the admin console).
 * - Enrolled students can view published courses.
 * Every helper 404s (not 403s) when access is denied, so course ids can't be probed.
 */
import "server-only";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CurrentUser } from "./auth/dal";
import { type CourseCapability, type CourseStaffRole, staffCan } from "./auth/capabilities";

export type Course = typeof schema.courses.$inferSelect;

/** This user's staff role in a course, or null. */
export async function courseStaffRole(userId: string, courseId: string): Promise<CourseStaffRole | null> {
  const row = await db.query.courseStaff.findFirst({
    where: (s, { and, eq }) => and(eq(s.courseId, courseId), eq(s.userId, userId)),
    columns: { role: true },
  });
  return row?.role ?? null;
}

/**
 * A course the user may act on as staff, with the capability the caller needs.
 * Defaults to "course.manage" (the strictest common need), so a caller that forgets to
 * say what it needs fails closed. Admins pass (support and oversight).
 */
export async function courseForInstructor(user: CurrentUser, courseId: string, capability: CourseCapability = "course.manage"): Promise<Course> {
  const course = await db.query.courses.findFirst({ where: (c, { eq }) => eq(c.id, courseId) });
  if (!course) notFound();
  if (user.role === "admin") return course;
  if (user.role !== "instructor" || !staffCan(await courseStaffRole(user.id, course.id), capability)) notFound();
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
  const course = await courseForInstructor(user, courseId, "course.view");
  const manager = user.role === "admin" || staffCan(await courseStaffRole(user.id, course.id), "discussion.moderate");
  return { course, manager };
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
