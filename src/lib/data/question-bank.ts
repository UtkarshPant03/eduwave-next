/**
 * Question bank views (Phase 3, 4.4). Staff only: these include answer keys.
 *
 * Department sharing: someone who can manage a course may browse the banks of OTHER
 * courses in the same department (and copy from them). Courses in another department, or
 * courses without a department, are never visible: sharedBankSource 404s for them.
 */
import "server-only";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, ilike, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { courseForInstructor, courseStaffRole, type Course } from "@/lib/access";
import type { CurrentUser } from "@/lib/auth/dal";
import { staffCan } from "@/lib/auth/capabilities";
import { QUESTION_TYPES, type QuestionType } from "@/lib/questions";

const { bankQuestions: bq, questionCategories: qc, courses } = schema;

export type BankFilters = { category?: string; tag?: string; type?: string; q?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filters from the URL, validated (ignored when malformed). */
export function bankFilters(sp: Record<string, string | string[] | undefined>): BankFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const category = one("category");
  const type = one("type");
  return {
    category: UUID.test(category) ? category : undefined,
    type: (QUESTION_TYPES as readonly string[]).includes(type) ? type : undefined,
    tag: one("tag").toLowerCase().slice(0, 40) || undefined,
    q: one("q").slice(0, 100) || undefined,
  };
}

/** Categories of a course with how many questions each holds. */
export function bankCategories(courseId: string) {
  return db
    .select({ id: qc.id, name: qc.name, questions: sql<number>`(select count(*) from bank_questions b where b.category_id = ${qc.id})`.mapWith(Number) })
    .from(qc)
    .where(eq(qc.courseId, courseId))
    .orderBy(asc(qc.name));
}

/** Questions of a course's bank, filtered. */
export function bankQuestionList(courseId: string, f: BankFilters = {}) {
  const where: (SQL | undefined)[] = [eq(bq.courseId, courseId)];
  if (f.category) where.push(eq(bq.categoryId, f.category));
  if (f.type) where.push(eq(bq.type, f.type as QuestionType));
  if (f.tag) where.push(sql`${f.tag} = any(${bq.tags})`);
  // Escape LIKE wildcards so a search for "100%" means the text "100%".
  if (f.q) where.push(ilike(bq.prompt, `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`));
  return db
    .select({
      id: bq.id,
      categoryId: bq.categoryId,
      category: qc.name,
      type: bq.type,
      prompt: bq.prompt,
      options: bq.options,
      correctIndex: bq.correctIndex,
      correctIndexes: bq.correctIndexes,
      acceptedAnswers: bq.acceptedAnswers,
      numericAnswer: bq.numericAnswer,
      tolerance: bq.tolerance,
      points: bq.points,
      explanation: bq.explanation,
      tags: bq.tags,
      updatedAt: bq.updatedAt,
      usedInQuizzes: sql<number>`(select count(distinct q.quiz_id) from questions q where q.bank_question_id = ${bq.id})`.mapWith(Number),
    })
    .from(bq)
    .innerJoin(qc, eq(qc.id, bq.categoryId))
    .where(and(...where))
    .orderBy(asc(qc.name), desc(bq.updatedAt))
    .limit(500);
}

export type BankQuestionRow = Awaited<ReturnType<typeof bankQuestionList>>[number];

/** Every distinct tag in a course's bank (for the filter). */
export async function bankTags(courseId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ tag: sql<string>`unnest(${bq.tags})`.as("tag") })
    .from(bq)
    .where(eq(bq.courseId, courseId))
    .orderBy(sql`1`)
    .limit(200);
  return rows.map((r) => r.tag);
}

/** Other courses of the same department (none when the course has no department). */
export function departmentBankCourses(course: Course) {
  if (!course.departmentId) return Promise.resolve([]);
  return db
    .select({
      id: courses.id,
      code: courses.code,
      title: courses.title,
      term: courses.term,
      questions: sql<number>`(select count(*) from bank_questions b where b.course_id = ${courses.id})`.mapWith(Number),
    })
    .from(courses)
    .where(and(eq(courses.departmentId, course.departmentId), isNotNull(courses.departmentId), ne(courses.id, course.id)))
    .orderBy(asc(courses.code), asc(courses.term));
}

/**
 * The course whose bank `course`'s staff may browse/copy from: another course of the same
 * department. Anything else is a 404 (so course ids of other departments can't be probed).
 */
export async function sharedBankSource(course: Course, sourceCourseId: string): Promise<Course> {
  if (!course.departmentId || sourceCourseId === course.id) notFound();
  const source = await db.query.courses.findFirst({ where: (c, { eq }) => eq(c.id, sourceCourseId) });
  if (!source || !source.departmentId || source.departmentId !== course.departmentId) notFound();
  return source;
}

/** The bank page: a course's own bank. TAs and other `course.view` staff may look. */
export async function getBank(user: CurrentUser, courseId: string, filters: BankFilters) {
  const course = await courseForInstructor(user, courseId, "course.view");
  const canManage = user.role === "admin" || staffCan(await courseStaffRole(user.id, course.id), "course.manage");
  const [categories, questions, tags, shared] = await Promise.all([
    bankCategories(course.id),
    bankQuestionList(course.id, filters),
    bankTags(course.id),
    canManage ? departmentBankCourses(course) : Promise.resolve([]),
  ]);
  return { course, canManage, categories, questions, tags, shared };
}

/** Browsing another course's bank of the same department (only for staff who manage `courseId`). */
export async function getSharedBank(user: CurrentUser, courseId: string, sourceCourseId: string, filters: BankFilters) {
  const course = await courseForInstructor(user, courseId, "course.manage");
  const source = await sharedBankSource(course, sourceCourseId);
  const [categories, questions, tags, ownCategories] = await Promise.all([
    bankCategories(source.id),
    bankQuestionList(source.id, filters),
    bankTags(source.id),
    bankCategories(course.id),
  ]);
  return { course, source, categories, questions, tags, ownCategories };
}

/** What the quiz builder needs: categories (for random slots) and questions (to add). */
export async function bankForBuilder(courseId: string) {
  const [categories, questions] = await Promise.all([bankCategories(courseId), bankQuestionList(courseId)]);
  return { categories, questions };
}
