/**
 * Course listings, catalogue, outline (sections + activities) and progress.
 */
import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { countOf, outer } from "./sql";

const { courses, enrollments, users, sections, resources, files, assignments, quizzes, liveSessions, completions, attempts, submissions } =
  schema;

const enrolledCount = countOf(sql`select count(*) from enrollments e where e.course_id = ${outer("courses", "id")}`);

/** Total gradable/completable activities in a course (for progress). */
const activityCount = countOf(sql`
  (select count(*) from resources r where r.course_id = ${outer("courses", "id")}) +
  (select count(*) from assignments a where a.course_id = ${outer("courses", "id")}) +
  (select count(*) from quizzes q where q.course_id = ${outer("courses", "id")}) +
  (select count(*) from live_sessions l where l.course_id = ${outer("courses", "id")})`);

/** Activities a given student has completed in the outer course. */
const doneCount = (userId: string) =>
  countOf(sql`
  (select count(*) from completions c where c.course_id = ${outer("courses", "id")} and c.user_id = ${userId}) +
  (select count(*) from attempts at join quizzes q on q.id = at.quiz_id
     where q.course_id = ${outer("courses", "id")} and at.student_id = ${userId} and at.submitted_at is not null) +
  (select count(*) from submissions s join assignments a on a.id = s.assignment_id
     where a.course_id = ${outer("courses", "id")} and s.student_id = ${userId})`);

const courseCard = {
  id: courses.id,
  code: courses.code,
  title: courses.title,
  term: courses.term,
  department: courses.department,
  credits: courses.credits,
  color: courses.color,
  published: courses.published,
};

export function listInstructorCourses(instructorId: string) {
  return db
    .select({
      ...courseCard,
      students: enrolledCount,
      activities: activityCount,
      toGrade: countOf(sql`select count(*) from submissions s join assignments a on a.id = s.assignment_id
        where a.course_id = ${outer("courses", "id")} and s.grade is null`),
    })
    .from(courses)
    .where(eq(courses.instructorId, instructorId))
    .orderBy(desc(courses.term), asc(courses.code));
}

export function listStudentCourses(userId: string) {
  return db
    .select({ ...courseCard, instructor: users.name, activities: activityCount, done: doneCount(userId) })
    .from(courses)
    .innerJoin(enrollments, and(eq(enrollments.courseId, courses.id), eq(enrollments.userId, userId)))
    .innerJoin(users, eq(users.id, courses.instructorId))
    .where(eq(courses.published, true))
    .orderBy(asc(courses.code));
}

/** Published courses with whether the student is already enrolled. Keys are never returned. */
export function courseCatalog(userId: string) {
  return db
    .select({
      ...courseCard,
      description: courses.description,
      instructor: users.name,
      students: enrolledCount,
      selfEnrol: sql<boolean>`${courses.enrollmentKey} is not null`,
      enrolled: sql<boolean>`exists (select 1 from enrollments e where e.course_id = ${outer("courses", "id")} and e.user_id = ${userId})`,
    })
    .from(courses)
    .innerJoin(users, eq(users.id, courses.instructorId))
    .where(eq(courses.published, true))
    .orderBy(asc(courses.department), asc(courses.code));
}

export function courseParticipants(courseId: string) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      studentId: users.studentId,
      program: users.program,
      enrolledAt: enrollments.enrolledAt,
      lastLoginAt: users.lastLoginAt,
      active: users.active,
    })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.userId))
    .where(eq(enrollments.courseId, courseId))
    .orderBy(asc(users.name));
}

export type OutlineItem = {
  kind: "resource" | "assignment" | "quiz" | "live";
  id: string;
  title: string;
  description?: string | null;
  date?: Date | null; // due date / deadline / start time
  href?: string | null; // external link or file download
  meta?: string | null;
  file?: { name: string; size: number; mimeType: string } | null;
  done?: boolean;
};
export type OutlineSection = { id: string | null; title: string; summary: string | null; position: number; items: OutlineItem[] };

/** Course page structure. Pass `studentId` to include that student's completion state. */
export async function courseOutline(courseId: string, studentId?: string): Promise<OutlineSection[]> {
  const [secs, res, asg, qz, live] = await Promise.all([
    db.select().from(sections).where(eq(sections.courseId, courseId)).orderBy(asc(sections.position)),
    db
      .select({ r: resources, fileName: files.name, fileSize: files.size, mimeType: files.mimeType })
      .from(resources)
      .leftJoin(files, eq(files.id, resources.fileId))
      .where(eq(resources.courseId, courseId))
      .orderBy(asc(resources.createdAt)),
    db.select().from(assignments).where(eq(assignments.courseId, courseId)).orderBy(asc(assignments.dueAt)),
    db.select().from(quizzes).where(eq(quizzes.courseId, courseId)).orderBy(asc(quizzes.deadline)),
    db.select().from(liveSessions).where(eq(liveSessions.courseId, courseId)).orderBy(asc(liveSessions.startsAt)),
  ]);

  let done = new Set<string>();
  if (studentId) {
    const [c, a, s] = await Promise.all([
      db.select({ id: completions.itemId }).from(completions).where(and(eq(completions.userId, studentId), eq(completions.courseId, courseId))),
      qz.length
        ? db
            .select({ id: attempts.quizId })
            .from(attempts)
            .where(and(eq(attempts.studentId, studentId), inArray(attempts.quizId, qz.map((q) => q.id)), sql`${attempts.submittedAt} is not null`))
        : [],
      asg.length
        ? db
            .select({ id: submissions.assignmentId })
            .from(submissions)
            .where(and(eq(submissions.studentId, studentId), inArray(submissions.assignmentId, asg.map((x) => x.id))))
        : [],
    ]);
    done = new Set([...c, ...a, ...s].map((x) => x.id));
  }

  const items: (OutlineItem & { sectionId: string | null })[] = [
    ...res.map(({ r, fileName, fileSize, mimeType }) => ({
      kind: "resource" as const,
      id: r.id,
      sectionId: r.sectionId,
      title: r.title,
      description: r.description,
      href: r.fileId ? `/files/${r.fileId}` : r.url,
      meta: r.url ? new URL(r.url).hostname : null,
      file: r.fileId && fileName ? { name: fileName, size: fileSize ?? 0, mimeType: mimeType ?? "" } : null,
    })),
    ...asg.map((a) => ({ kind: "assignment" as const, id: a.id, sectionId: a.sectionId, title: a.title, date: a.dueAt, meta: `${a.maxPoints} pts` })),
    ...qz.map((q) => ({ kind: "quiz" as const, id: q.id, sectionId: q.sectionId, title: q.title, date: q.deadline, meta: `${q.timeLimitMinutes} min` })),
    ...live.map((l) => ({ kind: "live" as const, id: l.id, sectionId: l.sectionId, title: l.title, date: l.startsAt, meta: `${l.durationMinutes} min` })),
  ].map((i) => ({ ...i, done: studentId ? done.has(i.id) : undefined }));

  const general: OutlineSection = { id: null, title: "General", summary: null, position: -1, items: items.filter((i) => !i.sectionId) };
  const result = secs.map((s) => ({ id: s.id, title: s.title, summary: s.summary, position: s.position, items: items.filter((i) => i.sectionId === s.id) }));
  return general.items.length ? [general, ...result] : result;
}

export function listSections(courseId: string) {
  return db.select({ id: sections.id, title: sections.title, position: sections.position }).from(sections).where(eq(sections.courseId, courseId)).orderBy(asc(sections.position));
}
