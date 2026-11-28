"use server";

/**
 * Gradebook setup and overrides (4.6). Every action re-checks the caller's capability on
 * the server: setup (method, categories, items, scale, release, course-total overrides)
 * needs `course.manage`; item overrides need `grade.edit` (so teaching assistants can
 * correct an item's grade with a reason, but not change the course's grading scheme).
 * Override history is written by a database trigger in the same transaction as the change.
 */
import { refresh } from "next/cache";
import { and, eq, inArray, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { courseForInstructor } from "@/lib/access";
import { audit } from "@/lib/audit";
import type { CourseCapability } from "@/lib/auth/capabilities";
import { requireInstructor } from "@/lib/auth/dal";
import { firstIssue, type FormState } from "@/lib/form";
import { scaleProblem } from "@/lib/grading";
import { notifyCourse } from "@/lib/notify";
import { quizPossible } from "@/lib/quiz-engine";

const uuid = z.uuid();
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Thrown inside a transaction to roll it back with a message for the user. */
class Refused extends Error {}

async function staffCourse(courseId: unknown, capability: CourseCapability) {
  const user = await requireInstructor();
  const course = await courseForInstructor(user, uuid.parse(courseId), capability);
  return { user, course };
}

/** Serialises gradebook changes of one course (setup vs. item edits vs. overrides). */
async function lockCourse(tx: Tx, courseId: string) {
  await tx.select({ id: schema.courses.id }).from(schema.courses).where(eq(schema.courses.id, courseId)).for("update");
}

/** Titles of the course's assignments and quizzes that have no category. */
async function uncategorisedTitles(tx: Tx, courseId: string) {
  const [a, q] = await Promise.all([
    tx.select({ title: schema.assignments.title }).from(schema.assignments).where(and(eq(schema.assignments.courseId, courseId), isNull(schema.assignments.gradeCategoryId))),
    tx.select({ title: schema.quizzes.title }).from(schema.quizzes).where(and(eq(schema.quizzes.courseId, courseId), isNull(schema.quizzes.gradeCategoryId))),
  ]);
  return [...a, ...q].map((x) => x.title);
}

function listSome(titles: string[]) {
  const shown = titles.slice(0, 3).map((t) => `"${t}"`).join(", ");
  return titles.length > 3 ? `${shown} and ${titles.length - 3} more` : shown;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------ method & categories ------------------------------ */

const categoryInput = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Every category needs a name.").max(60, "Category names are at most 60 characters."),
  weight: z.coerce.number({ message: "Weights are numbers." }).min(0, "Weights can't be negative.").max(100, "A weight is at most 100%.").transform(round2),
});

const setupInput = z.object({
  courseId: uuid,
  method: z.enum(["points", "weighted"]),
  categories: z.array(categoryInput).max(20, "At most 20 categories."),
});

/**
 * Saves the total method and the whole category list at once (so weights can be changed
 * together and still total 100). Categories left out are deleted: their items become
 * uncategorised, which is refused while the course uses weighted categories.
 */
export async function saveGradebookSetup(input: z.input<typeof setupInput>): Promise<FormState> {
  const parsed = setupInput.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { user, course } = await staffCourse(parsed.data.courseId, "course.manage");
  const { method, categories } = parsed.data;

  const names = categories.map((c) => c.name.toLowerCase());
  if (new Set(names).size !== names.length) return { error: "Two categories have the same name." };
  const ids = categories.flatMap((c) => (c.id ? [c.id] : []));
  if (new Set(ids).size !== ids.length) return { error: "A category is listed twice." };
  if (method === "weighted") {
    if (categories.length === 0) return { error: "Weighted categories need at least one category." };
    const total = round2(categories.reduce((s, c) => s + c.weight, 0));
    if (Math.abs(total - 100) > 0.001) return { error: `In weighted mode the weights must total 100% (they total ${total}%).` };
  }

  try {
    await db.transaction(async (tx) => {
      await lockCourse(tx, course.id);
      const existing = await tx.select({ id: schema.gradeCategories.id, name: schema.gradeCategories.name }).from(schema.gradeCategories).where(eq(schema.gradeCategories.courseId, course.id));
      const existingIds = new Set(existing.map((c) => c.id));
      if (ids.some((id) => !existingIds.has(id))) throw new Refused("A category was removed by someone else. Reload the page and try again.");

      const removed = existing.filter((c) => !ids.includes(c.id));
      if (removed.length) {
        // ON DELETE SET NULL: their items become uncategorised (checked below in weighted mode).
        await tx.delete(schema.gradeCategories).where(inArray(schema.gradeCategories.id, removed.map((c) => c.id)));
      }
      // Two-step rename so swapping two names never trips the unique (course, name) rule.
      if (ids.length) await tx.update(schema.gradeCategories).set({ name: sql`'~' || ${schema.gradeCategories.id}::text` }).where(inArray(schema.gradeCategories.id, ids));
      for (const [position, c] of categories.entries()) {
        if (c.id) await tx.update(schema.gradeCategories).set({ name: c.name, weight: c.weight, position }).where(eq(schema.gradeCategories.id, c.id));
        else await tx.insert(schema.gradeCategories).values({ courseId: course.id, name: c.name, weight: c.weight, position });
      }
      if (method === "weighted") {
        const missing = await uncategorisedTitles(tx, course.id);
        if (missing.length)
          throw new Refused(
            `Put every assignment and quiz in a category before using weighted categories. Without a category: ${listSome(missing)}. Save the categories in points mode first, then assign items below.`,
          );
      }
      await tx.update(schema.courses).set({ gradeTotalMethod: method }).where(eq(schema.courses.id, course.id));
    });
  } catch (err) {
    if (err instanceof Refused) return { error: err.message };
    throw err;
  }
  await audit(user.id, "gradebook_changed", `${course.code} ${course.term}: total method ${method}, ${categories.length} categor${categories.length === 1 ? "y" : "ies"}`);
  refresh();
  return { success: method === "weighted" ? "Saved. The course total now uses weighted categories." : "Saved. The course total is the sum of points." };
}

/* ------------------------------ items: category & release ------------------------------ */

/**
 * Saves each item's category and whether its grades are released to students. The form
 * lists every item as `item = "assignment:<id>" | "quiz:<id>"` with `category:<id>` and an
 * optional `released:<id>` checkbox. Students are notified when an item's grades are released.
 */
export async function saveGradeItems(_: FormState, formData: FormData): Promise<FormState> {
  const { user, course } = await staffCourse(formData.get("courseId"), "course.manage");
  const listed = formData.getAll("item").map(String);
  const parsedItems: { kind: "assignment" | "quiz"; id: string; categoryId: string | null; released: boolean }[] = [];
  for (const entry of listed.slice(0, 500)) {
    const [kind, id] = entry.split(":");
    if ((kind !== "assignment" && kind !== "quiz") || !uuid.safeParse(id).success) return { error: "Invalid item." };
    const category = String(formData.get(`category:${id}`) ?? "");
    if (category && !uuid.safeParse(category).success) return { error: "Invalid category." };
    parsedItems.push({ kind, id, categoryId: category || null, released: formData.get(`released:${id}`) === "on" });
  }
  if (parsedItems.length === 0) return { error: "Nothing to save." };

  let newlyReleased: string[];
  try {
    newlyReleased = await db.transaction(async (tx) => {
      await lockCourse(tx, course.id);
      const [courseRow] = await tx.select({ method: schema.courses.gradeTotalMethod }).from(schema.courses).where(eq(schema.courses.id, course.id));
      const cats = new Set(
        (await tx.select({ id: schema.gradeCategories.id }).from(schema.gradeCategories).where(eq(schema.gradeCategories.courseId, course.id))).map((c) => c.id),
      );
      const released: string[] = [];
      for (const it of parsedItems) {
        if (it.categoryId && !cats.has(it.categoryId)) throw new Refused("A category was removed by someone else. Reload the page and try again.");
        const table = it.kind === "assignment" ? schema.assignments : schema.quizzes;
        // Only this course's items are touched (a foreign id simply matches nothing).
        const [before] = await tx
          .select({ title: table.title, released: table.gradesReleased })
          .from(table)
          .where(and(eq(table.id, it.id), eq(table.courseId, course.id)))
          .for("update");
        if (!before) continue;
        await tx.update(table).set({ gradeCategoryId: it.categoryId, gradesReleased: it.released }).where(eq(table.id, it.id));
        if (!before.released && it.released) released.push(before.title);
      }
      if (courseRow?.method === "weighted") {
        const missing = await uncategorisedTitles(tx, course.id);
        if (missing.length) throw new Refused(`This course uses weighted categories, so every item needs a category. Without a category: ${listSome(missing)}.`);
      }
      return released;
    });
  } catch (err) {
    if (err instanceof Refused) return { error: err.message };
    throw err;
  }
  await audit(user.id, "gradebook_changed", `${course.code} ${course.term}: item categories and release saved`);
  if (newlyReleased.length) {
    await notifyCourse(course.id, {
      title: `${course.code}: grades released`,
      body: newlyReleased.length === 1 ? newlyReleased[0] : `${newlyReleased.length} items: ${listSome(newlyReleased)}`,
      link: `/student/courses/${course.id}#grades`,
    });
  }
  refresh();
  return { success: newlyReleased.length ? `Saved. Students were notified that grades for ${newlyReleased.length} item${newlyReleased.length === 1 ? " were" : "s were"} released.` : "Saved." };
}

/* ------------------------------------ scale ------------------------------------ */

const bandInput = z.object({
  letter: z.string().trim().min(1, "Every band needs a letter.").max(8, "Letters are at most 8 characters."),
  label: z.string().trim().max(40, "Labels are at most 40 characters.").default(""),
  min: z.coerce.number({ message: "Minimums are numbers." }),
  points: z.coerce.number({ message: "Grade points are numbers." }).transform(round2),
});

const scaleInput = z.object({ courseId: uuid, bands: z.array(bandInput).min(1, "Add at least one band.").max(20, "At most 20 bands.") });

/**
 * Replaces the course's grade scale. Bands are given from the highest minimum down; the
 * server checks minimums strictly descending, a band starting at 0, unique letters and
 * points >= 0. A letter used by a course-total override can't be removed.
 */
export async function saveGradeScale(input: z.input<typeof scaleInput>): Promise<FormState> {
  const parsed = scaleInput.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { user, course } = await staffCourse(parsed.data.courseId, "course.manage");
  const bands = parsed.data.bands;
  const problem = scaleProblem(bands);
  if (problem) return { error: problem };
  const letters = bands.map((b) => b.letter);

  try {
    await db.transaction(async (tx) => {
      await lockCourse(tx, course.id);
      const used = await tx
        .selectDistinct({ letter: schema.gradeOverrides.letter })
        .from(schema.gradeOverrides)
        .where(and(eq(schema.gradeOverrides.courseId, course.id), isNotNull(schema.gradeOverrides.letter), notInArray(schema.gradeOverrides.letter, letters)));
      if (used.length) throw new Refused(`The letter "${used[0].letter}" is used by a course-total override. Remove that override first, or keep the letter.`);
      await tx.delete(schema.gradeBands).where(and(eq(schema.gradeBands.courseId, course.id), notInArray(schema.gradeBands.letter, letters)));
      for (const b of bands) {
        await tx
          .insert(schema.gradeBands)
          .values({ courseId: course.id, letter: b.letter, label: b.label, minPercent: b.min, points: b.points })
          .onConflictDoUpdate({ target: [schema.gradeBands.courseId, schema.gradeBands.letter], set: { label: b.label, minPercent: b.min, points: b.points } });
      }
    });
  } catch (err) {
    if (err instanceof Refused) return { error: err.message };
    throw err;
  }
  await audit(user.id, "gradebook_changed", `${course.code} ${course.term}: grade scale saved (${bands.map((b) => `${b.letter}>=${b.min}`).join(", ")})`);
  refresh();
  return { success: "Grade scale saved. Letters in the gradebook now follow it." };
}

/* ---------------------------------- overrides ---------------------------------- */

const reasonField = z.string().trim().min(3, "Give a reason (at least 3 characters).").max(1000, "Reasons are at most 1000 characters.");

const itemOverrideInput = z.object({
  courseId: uuid,
  studentId: uuid,
  item: z.string().regex(/^(assignment|quiz):[0-9a-f-]{36}$/i, "Choose an assignment or quiz."),
  points: z.coerce.number({ message: "Enter the points that should count." }).min(0, "Points can't be negative.").transform(round2),
  reason: reasonField,
});

/** Writes (or replaces) an override row and returns null, or a message. Call in a transaction. */
async function upsertOverride(
  tx: Tx,
  target: { courseId: string; studentId: string; assignmentId: string | null; quizId: string | null },
  values: { points: number | null; percent: number | null; letter: string | null; reason: string; setBy: string },
) {
  const o = schema.gradeOverrides;
  const match = and(
    eq(o.courseId, target.courseId),
    eq(o.studentId, target.studentId),
    target.assignmentId ? eq(o.assignmentId, target.assignmentId) : isNull(o.assignmentId),
    target.quizId ? eq(o.quizId, target.quizId) : isNull(o.quizId),
  );
  const [current] = await tx.select({ id: o.id }).from(o).where(match).for("update");
  if (current) await tx.update(o).set(values).where(eq(o.id, current.id));
  else await tx.insert(o).values({ ...target, ...values });
}

async function isEnrolled(tx: Tx, courseId: string, studentId: string) {
  const [row] = await tx
    .select({ id: schema.enrollments.userId })
    .from(schema.enrollments)
    .where(and(eq(schema.enrollments.courseId, courseId), eq(schema.enrollments.userId, studentId)));
  return Boolean(row);
}

/**
 * Overrides the value one item counts with for one student (staff with `grade.edit`).
 * The submission or attempt itself is not changed. A reason is mandatory and is kept,
 * with the old and new values, in the append-only history.
 */
export async function setItemOverride(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = itemOverrideInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { user, course } = await staffCourse(parsed.data.courseId, "grade.edit");
  const { studentId, points, reason } = parsed.data;
  const [kind, itemId] = parsed.data.item.split(":") as ["assignment" | "quiz", string];

  try {
    await db.transaction(async (tx) => {
      await lockCourse(tx, course.id);
      if (!(await isEnrolled(tx, course.id, studentId))) throw new Refused("That student isn't enrolled in this course.");
      let possible: number;
      if (kind === "assignment") {
        const [a] = await tx.select({ max: schema.assignments.maxPoints }).from(schema.assignments).where(and(eq(schema.assignments.id, itemId), eq(schema.assignments.courseId, course.id))).for("share");
        if (!a) throw new Refused("That assignment isn't in this course.");
        possible = a.max;
      } else {
        const [q] = await tx.select({ id: schema.quizzes.id }).from(schema.quizzes).where(and(eq(schema.quizzes.id, itemId), eq(schema.quizzes.courseId, course.id))).for("share");
        if (!q) throw new Refused("That quiz isn't in this course.");
        possible = (await quizPossible([itemId])).get(itemId) ?? 0;
      }
      if (points > possible) throw new Refused(`At most ${possible} points (the item's maximum).`);
      await upsertOverride(
        tx,
        { courseId: course.id, studentId, assignmentId: kind === "assignment" ? itemId : null, quizId: kind === "quiz" ? itemId : null },
        { points, percent: null, letter: null, reason, setBy: user.id },
      );
    });
  } catch (err) {
    if (err instanceof Refused) return { error: err.message };
    throw err;
  }
  await audit(studentId, "grade_overridden", `${course.code} ${course.term}: ${kind} ${itemId} set to ${points}`, user.id);
  refresh();
  return { success: "Override saved. The gradebook now uses this value; the original stays in the history." };
}

const courseOverrideInput = z.object({
  courseId: uuid,
  studentId: uuid,
  percent: z
    .string()
    .optional()
    .transform((s) => (s?.trim() ? Number(s) : null))
    .pipe(z.number({ message: "Enter a percentage." }).min(0, "Percentages are 0 to 100.").max(100, "Percentages are 0 to 100.").transform(round2).nullable()),
  letter: z
    .string()
    .optional()
    .transform((s) => s?.trim() || null),
  reason: reasonField,
});

/** Overrides a student's course total and/or letter (staff with `course.manage`). */
export async function setCourseOverride(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = courseOverrideInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { user, course } = await staffCourse(parsed.data.courseId, "course.manage");
  const { studentId, percent, letter, reason } = parsed.data;
  if (percent == null && letter == null) return { error: "Enter a percentage, choose a letter, or both." };

  try {
    await db.transaction(async (tx) => {
      await lockCourse(tx, course.id);
      if (!(await isEnrolled(tx, course.id, studentId))) throw new Refused("That student isn't enrolled in this course.");
      if (letter) {
        const [band] = await tx.select({ letter: schema.gradeBands.letter }).from(schema.gradeBands).where(and(eq(schema.gradeBands.courseId, course.id), eq(schema.gradeBands.letter, letter)));
        if (!band) throw new Refused(`"${letter}" isn't a letter of this course's grade scale.`);
      }
      await upsertOverride(tx, { courseId: course.id, studentId, assignmentId: null, quizId: null }, { points: null, percent, letter, reason, setBy: user.id });
    });
  } catch (err) {
    if (err instanceof Refused) return { error: err.message };
    throw err;
  }
  await audit(studentId, "grade_overridden", `${course.code} ${course.term}: course total set to ${[percent != null ? `${percent}%` : null, letter].filter(Boolean).join(" ")}`, user.id);
  refresh();
  return { success: "Course total override saved." };
}

const removeInput = z.object({ overrideId: uuid, reason: reasonField });

/**
 * Removes an override (the calculated value counts again). The row is kept with empty
 * values so the history, including this removal and its reason, stays complete.
 */
export async function removeOverride(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = removeInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const user = await requireInstructor();
  const existing = await db.query.gradeOverrides.findFirst({ where: (o, { eq }) => eq(o.id, parsed.data.overrideId) });
  if (!existing) return { error: "Override not found." };
  const isItem = existing.assignmentId != null || existing.quizId != null;
  const course = await courseForInstructor(user, existing.courseId, isItem ? "grade.edit" : "course.manage");

  const changed = await db.transaction(async (tx) => {
    await lockCourse(tx, course.id);
    const [row] = await tx
      .select({ points: schema.gradeOverrides.points, percent: schema.gradeOverrides.percent, letter: schema.gradeOverrides.letter })
      .from(schema.gradeOverrides)
      .where(eq(schema.gradeOverrides.id, existing.id))
      .for("update");
    if (!row || (row.points == null && row.percent == null && row.letter == null)) return false;
    await tx
      .update(schema.gradeOverrides)
      .set({ points: null, percent: null, letter: null, reason: parsed.data.reason, setBy: user.id })
      .where(eq(schema.gradeOverrides.id, existing.id));
    return true;
  });
  if (!changed) return { error: "This override was already removed." };
  await audit(existing.studentId, "grade_overridden", `${course.code} ${course.term}: override ${existing.id} removed`, user.id);
  refresh();
  return { success: "Override removed. The calculated value counts again." };
}
