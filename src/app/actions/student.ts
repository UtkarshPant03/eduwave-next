"use server";

import { refresh } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireStudent } from "@/lib/auth/dal";
import { buildLayout, finalizeAttempt, isAttemptOpen } from "@/lib/quiz-engine";

/** Loads a quiz only if it belongs to the student's own class. */
async function quizForStudent(quizId: string, classId: string) {
  return db.query.quizzes.findFirst({
    where: (q, { and, eq }) => and(eq(q.id, quizId), eq(q.classId, classId)),
  });
}

export async function startAttempt(formData: FormData) {
  const student = await requireStudent();
  const quizId = z.uuid().parse(formData.get("quizId"));
  const quiz = await quizForStudent(quizId, student.classId);
  if (!quiz || quiz.deadline.getTime() <= Date.now()) return;

  const qs = await db.query.questions.findMany({
    where: (q, { eq }) => eq(q.quizId, quizId),
    columns: { id: true, options: true },
  });

  // The unique (quiz, student) constraint makes a second attempt impossible,
  // even if two requests race. The layout fixes this student's shuffled order.
  await db
    .insert(schema.attempts)
    .values({ quizId, studentId: student.id, total: qs.length, layout: buildLayout(qs, quiz.shuffle) })
    .onConflictDoNothing();
  refresh();
}

const answerInput = z.object({
  quizId: z.uuid(),
  questionId: z.uuid(),
  // Position of the option as SHOWN to this student; mapped back to the original below.
  displayIndex: z.number().int().min(0).max(5),
});

export type SaveAnswerResult = { ok: true } | { ok: false; reason: "closed" | "invalid" };

/** Saves one answer immediately, so nothing is lost if the tab closes or time runs out. */
export async function saveAnswer(input: z.input<typeof answerInput>): Promise<SaveAnswerResult> {
  const student = await requireStudent();
  const parsed = answerInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { quizId, questionId, displayIndex } = parsed.data;

  const quiz = await quizForStudent(quizId, student.classId);
  if (!quiz) return { ok: false, reason: "invalid" };

  const attempt = await db.query.attempts.findFirst({
    where: (a, { and, eq }) => and(eq(a.quizId, quizId), eq(a.studentId, student.id)),
  });
  if (!attempt || attempt.submittedAt || !isAttemptOpen(attempt, quiz)) {
    return { ok: false, reason: "closed" };
  }

  const question = await db.query.questions.findFirst({
    where: (q, { and, eq }) => and(eq(q.id, questionId), eq(q.quizId, quizId)),
  });
  if (!question || displayIndex >= question.options.length) return { ok: false, reason: "invalid" };
  const selectedIndex = attempt.layout?.optionOrders[questionId]?.[displayIndex] ?? displayIndex;

  await db
    .insert(schema.answers)
    .values({ attemptId: attempt.id, questionId, selectedIndex })
    .onConflictDoUpdate({
      target: [schema.answers.attemptId, schema.answers.questionId],
      set: { selectedIndex },
    });
  return { ok: true };
}

/** Submit early, or called by the client timer at zero. Grading happens server-side. */
export async function submitAttempt(quizId: string) {
  const student = await requireStudent();
  const id = z.uuid().parse(quizId);
  const attempt = await db.query.attempts.findFirst({
    where: (a) => and(eq(a.quizId, id), eq(a.studentId, student.id)),
  });
  if (attempt) await finalizeAttempt(attempt.id);
  refresh();
}
