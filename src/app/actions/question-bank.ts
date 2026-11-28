"use server";

/**
 * Question bank (Phase 3, 4.4). Staff who can manage a course (`course.manage`) create,
 * edit and delete its categories and questions; teaching assistants can only view.
 * Questions from other courses of the SAME department can be copied in (a copy, never a
 * live link). Every action re-checks access on the server.
 */
import { refresh } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { courseForInstructor } from "@/lib/access";
import { requireInstructor } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { isForeignKeyViolation } from "@/lib/db-errors";
import { firstIssue, type FormState } from "@/lib/form";
import { parseTags, questionInput, type QuestionInput } from "@/lib/questions";
import { sharedBankSource } from "@/lib/data/question-bank";

const uuid = z.uuid();

async function manageBank(courseId: unknown) {
  const user = await requireInstructor();
  const course = await courseForInstructor(user, uuid.parse(courseId), "course.manage");
  return { user, course };
}

/* ------------------------------- categories ------------------------------- */

const categoryName = z.string().trim().min(1, "Enter a category name.").max(80, "Category names are at most 80 characters.");

export async function createCategory(_: FormState, formData: FormData): Promise<FormState> {
  const { course } = await manageBank(formData.get("courseId"));
  const name = categoryName.safeParse(formData.get("name"));
  if (!name.success) return { error: firstIssue(name.error) };
  const [row] = await db.insert(schema.questionCategories).values({ courseId: course.id, name: name.data }).onConflictDoNothing().returning();
  if (!row) return { error: `There is already a category called "${name.data}".` };
  refresh();
  return { success: `Category "${name.data}" created.` };
}

export async function renameCategory(courseId: string, categoryId: string, name: string): Promise<{ error?: string }> {
  const { course } = await manageBank(courseId);
  const parsed = categoryName.safeParse(name);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    const rows = await db
      .update(schema.questionCategories)
      .set({ name: parsed.data })
      .where(and(eq(schema.questionCategories.id, uuid.parse(categoryId)), eq(schema.questionCategories.courseId, course.id)))
      .returning();
    if (!rows.length) return { error: "Category not found." };
  } catch {
    return { error: `There is already a category called "${parsed.data}".` };
  }
  refresh();
  return {};
}

export async function deleteCategory(courseId: string, categoryId: string): Promise<{ error?: string }> {
  const { course } = await manageBank(courseId);
  try {
    await db
      .delete(schema.questionCategories)
      .where(and(eq(schema.questionCategories.id, uuid.parse(categoryId)), eq(schema.questionCategories.courseId, course.id)));
  } catch (err) {
    // ON DELETE RESTRICT: a category that still holds questions can't be deleted.
    if (isForeignKeyViolation(err)) return { error: "Move or delete the questions in this category first." };
    throw err;
  }
  refresh();
  return {};
}

/* -------------------------------- questions -------------------------------- */

export type BankQuestionDraft = { courseId: string; id?: string; categoryId: string; tags: string; question: QuestionInput };

/**
 * Creates or edits a bank question. Quizzes hold their own copies, so editing here never
 * changes a quiz a student has started (see docs/DATABASE.md, 0005).
 */
export async function saveBankQuestion(draft: BankQuestionDraft): Promise<FormState> {
  const { user, course } = await manageBank(draft?.courseId);
  const categoryId = uuid.safeParse(draft.categoryId);
  if (!categoryId.success) return { error: "Choose a category." };
  const question = questionInput.safeParse(draft.question);
  if (!question.success) return { error: firstIssue(question.error) };
  const tags = parseTags(String(draft.tags ?? ""));

  const category = await db.query.questionCategories.findFirst({ where: (c, { and, eq }) => and(eq(c.id, categoryId.data), eq(c.courseId, course.id)) });
  if (!category) return { error: "Choose a category of this course." };

  const values = { ...question.data, categoryId: category.id, tags };
  if (draft.id) {
    const id = uuid.safeParse(draft.id);
    if (!id.success) return { error: "Question not found." };
    const rows = await db
      .update(schema.bankQuestions)
      .set({ ...values, updatedAt: sql`now()` })
      .where(and(eq(schema.bankQuestions.id, id.data), eq(schema.bankQuestions.courseId, course.id)))
      .returning({ id: schema.bankQuestions.id });
    if (!rows.length) return { error: "Question not found." };
  } else {
    await db.insert(schema.bankQuestions).values({ ...values, courseId: course.id, createdBy: user.id });
  }
  refresh();
  return { success: draft.id ? "Question updated. Quizzes that already use it keep their own copy." : "Question added to the bank." };
}

export async function deleteBankQuestion(courseId: string, questionId: string): Promise<{ error?: string }> {
  const { course } = await manageBank(courseId);
  await db
    .delete(schema.bankQuestions)
    .where(and(eq(schema.bankQuestions.id, uuid.parse(questionId)), eq(schema.bankQuestions.courseId, course.id)));
  refresh();
  return {};
}

/* -------------------------- sharing within a department -------------------------- */

const copyInput = z.object({
  courseId: uuid,
  sourceCourseId: uuid,
  categoryId: uuid,
  questionIds: z.array(uuid).min(1, "Select at least one question.").max(200),
});

/**
 * Copies questions from another course's bank in the SAME department into this course's
 * bank. The copy is independent: later edits on either side don't affect the other.
 */
export async function copyBankQuestions(input: z.input<typeof copyInput>): Promise<FormState> {
  const parsed = copyInput.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { user, course } = await manageBank(parsed.data.courseId);
  // 404s unless the source is another course of this course's department.
  const source = await sharedBankSource(course, parsed.data.sourceCourseId);
  const category = await db.query.questionCategories.findFirst({
    where: (c, { and, eq }) => and(eq(c.id, parsed.data.categoryId), eq(c.courseId, course.id)),
  });
  if (!category) return { error: "Choose a category of this course to copy into." };

  const bq = schema.bankQuestions;
  const rows = await db.select().from(bq).where(and(eq(bq.courseId, source.id), inArray(bq.id, parsed.data.questionIds)));
  if (!rows.length) return { error: "Those questions no longer exist." };
  await db.insert(bq).values(
    rows.map((r) => ({
      courseId: course.id,
      categoryId: category.id,
      type: r.type,
      prompt: r.prompt,
      options: r.options,
      correctIndex: r.correctIndex,
      correctIndexes: r.correctIndexes,
      acceptedAnswers: r.acceptedAnswers,
      numericAnswer: r.numericAnswer,
      tolerance: r.tolerance,
      points: r.points,
      explanation: r.explanation,
      tags: r.tags,
      createdBy: user.id,
    })),
  );
  await audit(user.id, "bank_questions_copied", `${rows.length} question(s) from ${source.code} ${source.term} to ${course.code} ${course.term}`);
  refresh();
  return { success: `Copied ${rows.length} question${rows.length === 1 ? "" : "s"} into "${category.name}".` };
}
