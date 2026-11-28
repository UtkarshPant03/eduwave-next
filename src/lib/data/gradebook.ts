/**
 * Gradebook: a students × items matrix (assignments + quizzes) with course totals.
 *
 * 4.6: totals follow the course's method (points or weighted categories) and its grade
 * scale (data, see grade_bands); staff overrides replace calculated values; items whose
 * grades aren't released are blanked out in a student's own view, here on the server, so
 * their values never reach the browser.
 */
import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import {
  applyCourseOverride,
  categoryResults,
  courseTotal,
  DEFAULT_GRADE_SCALE,
  sortScale,
  weightedTotal,
  type GradeBand,
  type GradeCategory,
  type GradeCell,
  type TotalMethod,
} from "@/lib/grading";
import { gradedResult, type FinishedAttempt } from "@/lib/questions";
import { finalizeExpiredAttempts, quizPossible } from "@/lib/quiz-engine";
import { courseParticipants } from "./courses";

const { assignments, quizzes, submissions, attempts, gradeOverrides, gradeOverrideEvents, users } = schema;

/**
 * `due` is shown to users; `closes` is when missing work starts counting as 0
 * (for assignments: the due date plus the late window).
 */
export type GradeItem = {
  id: string;
  kind: "assignment" | "quiz";
  title: string;
  possible: number;
  due: Date;
  closes: Date;
  categoryId: string | null;
  released: boolean;
};

/** A cell as the gradebook returns it (staff views also get the calculated value under an override). */
export type BookCell = GradeCell & { categoryId: string | null; calculated?: number | null };

const DAY = 86_400_000;

/** The course's grade scale (highest band first); the default scale if none is stored. */
export async function courseScale(courseId: string): Promise<GradeBand[]> {
  const rows = await db
    .select({ letter: schema.gradeBands.letter, label: schema.gradeBands.label, min: schema.gradeBands.minPercent, points: schema.gradeBands.points })
    .from(schema.gradeBands)
    .where(eq(schema.gradeBands.courseId, courseId));
  return rows.length ? sortScale(rows) : [...DEFAULT_GRADE_SCALE];
}

/** The course's categories in display order. */
export function courseCategories(courseId: string): Promise<GradeCategory[]> {
  return db
    .select({ id: schema.gradeCategories.id, name: schema.gradeCategories.name, weight: schema.gradeCategories.weight })
    .from(schema.gradeCategories)
    .where(eq(schema.gradeCategories.courseId, courseId))
    .orderBy(asc(schema.gradeCategories.position), asc(schema.gradeCategories.name));
}

/**
 * The gradebook of a course.
 * - `audience: "staff"`: every item and value, overrides with their calculated values.
 * - `audience: "student"`: for one student's own view (`studentId` required). Items whose
 *   grades aren't released become "unreleased" cells with no value, don't count towards the
 *   total or any category, and their overrides are left out.
 */
export async function gradebook(courseId: string, opts: { audience: "staff" | "student"; studentId?: string }) {
  const forStudent = opts.audience === "student";
  if (forStudent && !opts.studentId) throw new Error("gradebook: a student view needs the student's id");
  const onlyStudentId = opts.studentId;
  // Abandoned quiz attempts must count with the score they earned, not as "missing".
  await finalizeExpiredAttempts(onlyStudentId ? { studentId: onlyStudentId } : { courseId });
  const now = Date.now();
  const [course, asg, qz, students, scale, categories] = await Promise.all([
    db.query.courses.findFirst({ where: (c, { eq }) => eq(c.id, courseId), columns: { gradeTotalMethod: true } }),
    // Only the columns needed (instructions can be 20 KB each).
    db
      .select({
        id: assignments.id,
        title: assignments.title,
        maxPoints: assignments.maxPoints,
        dueAt: assignments.dueAt,
        lateDays: assignments.lateDays,
        categoryId: assignments.gradeCategoryId,
        released: assignments.gradesReleased,
      })
      .from(assignments)
      .where(eq(assignments.courseId, courseId))
      .orderBy(asc(assignments.dueAt)),
    db
      .select({ id: quizzes.id, title: quizzes.title, deadline: quizzes.deadline, gradingMethod: quizzes.gradingMethod, categoryId: quizzes.gradeCategoryId, released: quizzes.gradesReleased })
      .from(quizzes)
      .where(eq(quizzes.courseId, courseId)),
    courseParticipants(courseId, onlyStudentId),
    courseScale(courseId),
    courseCategories(courseId),
  ]);
  const method: TotalMethod = course?.gradeTotalMethod ?? "points";
  // Points possible per quiz: fixed questions' points + random slots' picks × points.
  const questionCount = await quizPossible(qz.map((q) => q.id));
  const methodOf = new Map(qz.map((q) => [q.id, q.gradingMethod]));

  const items: GradeItem[] = [
    ...asg.map((a) => ({
      id: a.id,
      kind: "assignment" as const,
      title: a.title,
      possible: a.maxPoints,
      due: a.dueAt,
      closes: new Date(a.dueAt.getTime() + a.lateDays * DAY),
      categoryId: a.categoryId,
      released: a.released,
    })),
    ...qz.map((q) => ({
      id: q.id,
      kind: "quiz" as const,
      title: q.title,
      possible: questionCount.get(q.id) ?? 0,
      due: q.deadline,
      closes: q.deadline,
      categoryId: q.categoryId,
      released: q.released,
    })),
  ].sort((a, b) => a.due.getTime() - b.due.getTime());

  const ids = students.map((s) => s.id);
  const [subs, atts, overrides] = await Promise.all([
    asg.length && ids.length
      ? db
          .select({ assignmentId: submissions.assignmentId, studentId: submissions.studentId, grade: submissions.grade })
          .from(submissions)
          .where(and(inArray(submissions.assignmentId, asg.map((a) => a.id)), inArray(submissions.studentId, ids)))
      : [],
    qz.length && ids.length
      ? db
          .select({ quizId: attempts.quizId, studentId: attempts.studentId, attemptNumber: attempts.attemptNumber, score: attempts.score, total: attempts.total })
          .from(attempts)
          .where(and(inArray(attempts.quizId, qz.map((q) => q.id)), inArray(attempts.studentId, ids), isNotNull(attempts.submittedAt)))
      : [],
    ids.length
      ? db
          .select({
            studentId: gradeOverrides.studentId,
            assignmentId: gradeOverrides.assignmentId,
            quizId: gradeOverrides.quizId,
            points: gradeOverrides.points,
            percent: gradeOverrides.percent,
            letter: gradeOverrides.letter,
          })
          .from(gradeOverrides)
          .where(
            and(
              eq(gradeOverrides.courseId, courseId),
              inArray(gradeOverrides.studentId, ids),
              // Active overrides only (a removed one keeps its row with NULL values).
              or(isNotNull(gradeOverrides.points), isNotNull(gradeOverrides.percent), isNotNull(gradeOverrides.letter)),
            ),
          )
      : [],
  ]);
  // O(1) lookups instead of scanning every submission for every cell.
  const subBy = new Map(subs.map((x) => [`${x.assignmentId}:${x.studentId}`, x]));
  // Several attempts per student: the value that counts follows the quiz's grading method.
  const attemptsBy = new Map<string, FinishedAttempt[]>();
  for (const x of atts) {
    const key = `${x.quizId}:${x.studentId}`;
    attemptsBy.set(key, [...(attemptsBy.get(key) ?? []), { attemptNumber: x.attemptNumber, score: x.score ?? 0, total: x.total }]);
  }
  const attBy = new Map(
    [...attemptsBy].map(([key, list]) => [key, gradedResult(list, methodOf.get(key.split(":")[0]) ?? "highest")] as const),
  );
  const itemOverride = new Map<string, number>();
  const courseOverride = new Map<string, { percent: number | null; letter: string | null }>();
  for (const o of overrides) {
    const itemId = o.assignmentId ?? o.quizId;
    if (itemId && o.points != null) itemOverride.set(`${itemId}:${o.studentId}`, o.points);
    else if (!itemId) courseOverride.set(o.studentId, { percent: o.percent, letter: o.letter });
  }
  const knownCategory = new Set(categories.map((c) => c.id));

  const rows = students.map((s) => {
    const cells: Record<string, BookCell> = {};
    for (const item of items) {
      const categoryId = item.categoryId && knownCategory.has(item.categoryId) ? item.categoryId : null;
      if (forStudent && !item.released) {
        // Nothing about the grade leaves the server: no value, no status, no override.
        cells[item.id] = { earned: null, possible: item.possible, counted: false, status: "unreleased", categoryId };
        continue;
      }
      const closed = item.closes.getTime() < now;
      const missing: GradeCell = { earned: closed ? 0 : null, possible: item.possible, counted: closed, status: closed ? "missing" : "upcoming" };
      let cell: GradeCell;
      if (item.kind === "assignment") {
        const sub = subBy.get(`${item.id}:${s.id}`);
        cell = sub?.grade != null
          ? { earned: sub.grade, possible: item.possible, counted: true, status: "graded" }
          : sub
            ? { earned: null, possible: item.possible, counted: false, status: "submitted" }
            : missing;
      } else {
        const att = attBy.get(`${item.id}:${s.id}`);
        cell = att ? { earned: att.score ?? 0, possible: item.possible, counted: true, status: "graded" } : missing;
      }
      const override = itemOverride.get(`${item.id}:${s.id}`);
      cells[item.id] =
        override != null
          ? { earned: override, possible: item.possible, counted: true, status: "graded", overridden: true, categoryId, ...(forStudent ? {} : { calculated: cell.earned }) }
          : { ...cell, categoryId };
    }
    const list = Object.values(cells);
    const calculated =
      method === "weighted"
        ? weightedTotal(list, categories, scale)
        : { ...courseTotal(list, scale), categories: categoryResults(list, categories), uncategorised: 0 };
    const total = applyCourseOverride(calculated, courseOverride.get(s.id) ?? null, scale);
    return { student: s, cells, total };
  });

  return { method, scale, categories, items, rows };
}

export type Gradebook = Awaited<ReturnType<typeof gradebook>>;

/* =============================== setup views =============================== */

/** Categories for the assignment and quiz builders (and whether one is required). */
export async function gradeCategoryChoice(courseId: string) {
  const [course, categories] = await Promise.all([
    db.query.courses.findFirst({ where: (c, { eq }) => eq(c.id, courseId), columns: { gradeTotalMethod: true } }),
    courseCategories(courseId),
  ]);
  return { categories: categories.map(({ id, name }) => ({ id, name })), weighted: course?.gradeTotalMethod === "weighted" };
}

/** Everything the gradebook setup page edits (staff with course.manage). */
export async function gradebookSetup(courseId: string) {
  const [course, categories, scale, asg, qz] = await Promise.all([
    db.query.courses.findFirst({ where: (c, { eq }) => eq(c.id, courseId), columns: { gradeTotalMethod: true } }),
    courseCategories(courseId),
    courseScale(courseId),
    db
      .select({ id: assignments.id, title: assignments.title, due: assignments.dueAt, categoryId: assignments.gradeCategoryId, released: assignments.gradesReleased })
      .from(assignments)
      .where(eq(assignments.courseId, courseId)),
    db
      .select({ id: quizzes.id, title: quizzes.title, due: quizzes.deadline, categoryId: quizzes.gradeCategoryId, released: quizzes.gradesReleased })
      .from(quizzes)
      .where(eq(quizzes.courseId, courseId)),
  ]);
  const items = [...asg.map((a) => ({ ...a, kind: "assignment" as const })), ...qz.map((q) => ({ ...q, kind: "quiz" as const }))].sort(
    (a, b) => a.due.getTime() - b.due.getTime(),
  );
  return { method: (course?.gradeTotalMethod ?? "points") as TotalMethod, categories, scale, items };
}

/** Active overrides of a course, with who set them and why (staff only). */
export async function activeOverrides(courseId: string) {
  const setter = alias(users, "setter");
  return db
    .select({
      id: gradeOverrides.id,
      studentId: gradeOverrides.studentId,
      studentName: users.name,
      universityId: users.studentId,
      assignmentId: gradeOverrides.assignmentId,
      quizId: gradeOverrides.quizId,
      itemTitle: schema.assignments.title,
      quizTitle: schema.quizzes.title,
      points: gradeOverrides.points,
      percent: gradeOverrides.percent,
      letter: gradeOverrides.letter,
      reason: gradeOverrides.reason,
      setBy: setter.name,
      updatedAt: gradeOverrides.updatedAt,
    })
    .from(gradeOverrides)
    .innerJoin(users, eq(users.id, gradeOverrides.studentId))
    .innerJoin(setter, eq(setter.id, gradeOverrides.setBy))
    .leftJoin(schema.assignments, eq(schema.assignments.id, gradeOverrides.assignmentId))
    .leftJoin(schema.quizzes, eq(schema.quizzes.id, gradeOverrides.quizId))
    .where(
      and(
        eq(gradeOverrides.courseId, courseId),
        or(isNotNull(gradeOverrides.points), isNotNull(gradeOverrides.percent), isNotNull(gradeOverrides.letter)),
      ),
    )
    .orderBy(asc(users.name));
}

/** The override history of a course, newest first (append-only; staff only). */
export async function overrideHistory(courseId: string, limit = 100) {
  const student = alias(users, "student");
  return db
    .select({
      id: gradeOverrideEvents.id,
      studentName: student.name,
      universityId: student.studentId,
      assignmentTitle: schema.assignments.title,
      quizTitle: schema.quizzes.title,
      assignmentId: gradeOverrideEvents.assignmentId,
      quizId: gradeOverrideEvents.quizId,
      oldPoints: gradeOverrideEvents.oldPoints,
      newPoints: gradeOverrideEvents.newPoints,
      oldPercent: gradeOverrideEvents.oldPercent,
      newPercent: gradeOverrideEvents.newPercent,
      oldLetter: gradeOverrideEvents.oldLetter,
      newLetter: gradeOverrideEvents.newLetter,
      reason: gradeOverrideEvents.reason,
      changedBy: users.name,
      createdAt: gradeOverrideEvents.createdAt,
    })
    .from(gradeOverrideEvents)
    .innerJoin(student, eq(student.id, gradeOverrideEvents.studentId))
    .innerJoin(users, eq(users.id, gradeOverrideEvents.changedBy))
    .leftJoin(schema.assignments, eq(schema.assignments.id, gradeOverrideEvents.assignmentId))
    .leftJoin(schema.quizzes, eq(schema.quizzes.id, gradeOverrideEvents.quizId))
    .where(eq(gradeOverrideEvents.courseId, courseId))
    .orderBy(desc(gradeOverrideEvents.createdAt))
    .limit(limit);
}
