/**
 * Time-based views: calendar events and "what's due" lists.
 */
import "server-only";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";

const { assignments, quizzes, liveSessions, courses, submissions, attempts } = schema;

export type CalendarEvent = {
  id: string;
  kind: "assignment" | "quiz" | "live";
  title: string;
  at: Date;
  courseId: string;
  courseCode: string;
  color: string;
  done?: boolean;
};

/** Deadlines and live sessions for a set of courses within [from, to]. */
export async function calendarEvents(courseIds: string[], from: Date, to: Date, studentId?: string): Promise<CalendarEvent[]> {
  if (!courseIds.length) return [];
  const c = { courseId: courses.id, courseCode: courses.code, color: courses.color };
  const [a, q, l] = await Promise.all([
    db
      .select({ id: assignments.id, title: assignments.title, at: assignments.dueAt, ...c })
      .from(assignments)
      .innerJoin(courses, eq(courses.id, assignments.courseId))
      .where(and(inArray(assignments.courseId, courseIds), gte(assignments.dueAt, from), lte(assignments.dueAt, to))),
    db
      .select({ id: quizzes.id, title: quizzes.title, at: quizzes.deadline, ...c })
      .from(quizzes)
      .innerJoin(courses, eq(courses.id, quizzes.courseId))
      .where(and(inArray(quizzes.courseId, courseIds), gte(quizzes.deadline, from), lte(quizzes.deadline, to))),
    db
      .select({ id: liveSessions.id, title: liveSessions.title, at: liveSessions.startsAt, ...c })
      .from(liveSessions)
      .innerJoin(courses, eq(courses.id, liveSessions.courseId))
      .where(and(inArray(liveSessions.courseId, courseIds), gte(liveSessions.startsAt, from), lte(liveSessions.startsAt, to))),
  ]);

  let done = new Set<string>();
  if (studentId) {
    const [subs, atts] = await Promise.all([
      a.length ? db.select({ id: submissions.assignmentId }).from(submissions).where(and(eq(submissions.studentId, studentId), inArray(submissions.assignmentId, a.map((x) => x.id)))) : [],
      q.length ? db.select({ id: attempts.quizId }).from(attempts).where(and(eq(attempts.studentId, studentId), inArray(attempts.quizId, q.map((x) => x.id)))) : [],
    ]);
    done = new Set([...subs, ...atts].map((x) => x.id));
  }

  return [
    ...a.map((e) => ({ ...e, kind: "assignment" as const, done: done.has(e.id) })),
    ...q.map((e) => ({ ...e, kind: "quiz" as const, done: done.has(e.id) })),
    ...l.map((e) => ({ ...e, kind: "live" as const })),
  ].sort((x, y) => x.at.getTime() - y.at.getTime());
}

