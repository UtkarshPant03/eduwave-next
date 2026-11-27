/**
 * Admin console queries. Callers must have passed requireAdmin().
 */
import "server-only";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { countOf, outer } from "./sql";

const { users, courses, enrollments, auditLog, submissions, attempts } = schema;

/**
 * Headline numbers for the admin overview, in ONE round trip. Every number means exactly
 * what its label says: ACTIVE accounts, PUBLISHED courses, FINISHED work, failed sign-ins
 * in the last 24 hours (not "in the last N rows of the log").
 */
export async function siteStats() {
  const [row] = await db
    .select({
      students: sql<number>`(select count(*) from ${users} where ${users.role} = 'student' and ${users.active})`.mapWith(Number),
      instructors: sql<number>`(select count(*) from ${users} where ${users.role} = 'instructor' and ${users.active})`.mapWith(Number),
      courses: sql<number>`(select count(*) from ${courses})`.mapWith(Number),
      published: sql<number>`(select count(*) from ${courses} where ${courses.published})`.mapWith(Number),
      enrollments: sql<number>`(select count(*) from ${enrollments})`.mapWith(Number),
      submissions: sql<number>`(select count(*) from ${submissions})`.mapWith(Number),
      quizAttempts: sql<number>`(select count(*) from ${attempts} where ${attempts.submittedAt} is not null)`.mapWith(Number),
      failedSignIns24h: sql<number>`(select count(*) from ${auditLog} where ${auditLog.action} in ('login_failed', 'login_locked') and ${auditLog.createdAt} > now() - interval '24 hours')`.mapWith(Number),
    })
    .from(sql`(select 1) as one`);
  return row;
}

export function listUsers(filter: { q?: string; role?: string }) {
  const conds: SQL[] = [];
  if (filter.role && ["admin", "instructor", "student"].includes(filter.role)) conds.push(eq(users.role, filter.role as "admin"));
  if (filter.q) {
    const like = `%${filter.q.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(users.name, like), ilike(users.email, like), ilike(users.studentId, like))!);
  }
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      studentId: users.studentId,
      department: users.department,
      active: users.active,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
      courses: countOf(sql`select count(*) from enrollments e where e.user_id = ${outer("users", "id")}`),
    })
    .from(users)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(users.role), asc(users.name))
    .limit(500);
}

export function listAllCourses() {
  return db
    .select({
      id: courses.id,
      code: courses.code,
      title: courses.title,
      term: courses.term,
      department: courses.department,
      color: courses.color,
      published: courses.published,
      instructor: users.name,
      students: countOf(sql`select count(*) from enrollments e where e.course_id = ${outer("courses", "id")}`),
    })
    .from(courses)
    .innerJoin(users, eq(users.id, courses.instructorId))
    .orderBy(desc(courses.term), asc(courses.code));
}

export function listInstructors() {
  return db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.role, "instructor"), eq(users.active, true))).orderBy(asc(users.name));
}

export function siteAudit(limit = 50) {
  return db
    .select({ action: auditLog.action, detail: auditLog.detail, ip: auditLog.ip, createdAt: auditLog.createdAt, user: users.name, email: users.email })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
