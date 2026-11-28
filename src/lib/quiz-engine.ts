/**
 * Quiz rules. This is the main fix over the original app, where the browser
 * computed the score and the server trusted it.
 *
 * - The server records when an attempt starts; the timer is derived from that.
 * - Random-slot picks and the presentation order are fixed when the attempt starts.
 * - Answers are saved one at a time and rejected once time is up.
 * - Grading compares stored answers with stored answer keys, on the server.
 * - Finalising is idempotent: submit, expiry and page loads can all call it safely.
 */
import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AttemptLayout } from "@/db/schema";
import { scoreAttempt, type QuestionType, type Response } from "@/lib/questions";

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1); // crypto RNG: order can't be predicted from Math.random state
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Fixes the question and option order for one attempt (identity order if shuffle is off).
 * True/false options always stay "True, False".
 */
export function buildLayout(qs: { id: string; options: string[]; type?: QuestionType }[], shuffle: boolean): AttemptLayout {
  const order = (n: number) => Array.from({ length: n }, (_, i) => i);
  return {
    questionOrder: shuffle ? shuffled(qs.map((q) => q.id)) : qs.map((q) => q.id),
    optionOrders: Object.fromEntries(
      qs.map((q) => [q.id, shuffle && q.type !== "true_false" ? shuffled(order(q.options.length)) : order(q.options.length)]),
    ),
  };
}

type PoolQuestion = { id: string; position: number; slotId: string | null };
type Slot = { id: string; position: number; pickCount: number };

/**
 * Chooses the questions for a new attempt: every fixed question, plus `pickCount` questions
 * from each random slot's pool. Pool questions given least often so far (`usage`) are
 * preferred, ties broken at random, so students who start one after another get different
 * picks whenever the pool has enough questions. Returned in quiz order (slots in place).
 */
export function chooseQuestions<Q extends PoolQuestion>(questions: Q[], slots: Slot[], usage: Map<string, number> = new Map()): Q[] {
  const items: { position: number; picks: Q[] }[] = questions.filter((q) => !q.slotId).map((q) => ({ position: q.position, picks: [q] }));
  for (const slot of slots) {
    const pool = shuffled(questions.filter((q) => q.slotId === slot.id));
    // Stable sort after a random shuffle = random tie-break among equally used questions.
    pool.sort((a, b) => (usage.get(a.id) ?? 0) - (usage.get(b.id) ?? 0));
    items.push({ position: slot.position, picks: pool.slice(0, slot.pickCount) });
  }
  return items.sort((a, b) => a.position - b.position).flatMap((i) => i.picks);
}

/** Network latency allowance for the last answer and the auto-submit. */
export const GRACE_MS = 10_000;

type AttemptTiming = { startedAt: Date };
type QuizTiming = { timeLimitMinutes: number; deadline: Date };

/** Students get the full time limit, but never past the quiz deadline. */
export function attemptEndsAt(attempt: AttemptTiming, quiz: QuizTiming): Date {
  const byLimit = attempt.startedAt.getTime() + quiz.timeLimitMinutes * 60_000;
  return new Date(Math.min(byLimit, quiz.deadline.getTime()));
}

export function isAttemptOpen(attempt: AttemptTiming, quiz: QuizTiming, now = Date.now()) {
  return now <= attemptEndsAt(attempt, quiz).getTime() + GRACE_MS;
}

/** The questions an attempt was given: its layout, or (pre-4.0 attempts) every fixed question. */
export function givenQuestionIds(layout: AttemptLayout | null | undefined, questions: { id: string; slotId: string | null }[]): string[] {
  return layout ? layout.questionOrder : questions.filter((q) => !q.slotId).map((q) => q.id);
}

/**
 * Grades and closes an attempt. Does nothing if it was already submitted.
 *
 * Runs in a transaction holding a lock on the attempt row. saveAnswer takes the same
 * lock, so the score is always computed from the final set of answers, and no answer
 * can be written afterwards (a database trigger also rejects that).
 *
 * `endedAt` records when the attempt really ended (e.g. the timer's end for an attempt
 * that was abandoned), instead of whenever someone happened to look at it.
 */
export async function finalizeAttempt(attemptId: string, endedAt?: Date) {
  await db.transaction(async (tx) => {
    const [attempt] = await tx
      .select({ id: schema.attempts.id, quizId: schema.attempts.quizId, submittedAt: schema.attempts.submittedAt, layout: schema.attempts.layout })
      .from(schema.attempts)
      .where(eq(schema.attempts.id, attemptId))
      .for("update");
    if (!attempt || attempt.submittedAt) return;

    const q = schema.questions;
    const qs = await tx
      .select({
        id: q.id,
        slotId: q.slotId,
        type: q.type,
        points: q.points,
        correctIndex: q.correctIndex,
        correctIndexes: q.correctIndexes,
        acceptedAnswers: q.acceptedAnswers,
        numericAnswer: q.numericAnswer,
        tolerance: q.tolerance,
      })
      .from(q)
      .where(eq(q.quizId, attempt.quizId));
    const a = schema.answers;
    const saved = await tx
      .select({ questionId: a.questionId, selectedIndex: a.selectedIndex, selectedIndexes: a.selectedIndexes, textAnswer: a.textAnswer, numberAnswer: a.numberAnswer })
      .from(a)
      .where(eq(a.attemptId, attemptId));

    const given = new Set(givenQuestionIds(attempt.layout, qs));
    const answers = new Map<string, Response>(saved.map((s) => [s.questionId, s]));
    const score = scoreAttempt(qs.filter((x) => given.has(x.id)), answers);

    await tx
      .update(schema.attempts)
      .set({ submittedAt: endedAt ?? sql`now()`, score })
      .where(and(eq(schema.attempts.id, attemptId), isNull(schema.attempts.submittedAt)));
  });
}

/** Call before showing an attempt: closes it if the student ran out of time. */
export async function finalizeIfExpired(
  attempt: AttemptTiming & { id: string; submittedAt: Date | null },
  quiz: QuizTiming,
) {
  if (!attempt.submittedAt && !isAttemptOpen(attempt, quiz)) {
    await finalizeAttempt(attempt.id, attemptEndsAt(attempt, quiz));
    return true;
  }
  return false;
}

/**
 * Closes every attempt in scope whose time (plus grace) has run out but which was never
 * submitted (tab closed, connection lost). Call before reading scores: gradebook,
 * analytics, exports, progress. Without it, an abandoned attempt shows as "missing".
 */
export async function finalizeExpiredAttempts(scope: { quizId: string } | { courseId: string } | { studentId: string }) {
  const a = schema.attempts;
  const q = schema.quizzes;
  const inScope =
    "quizId" in scope ? eq(a.quizId, scope.quizId) : "courseId" in scope ? eq(q.courseId, scope.courseId) : eq(a.studentId, scope.studentId);
  const expired = await db
    .select({ id: a.id, startedAt: a.startedAt, timeLimitMinutes: q.timeLimitMinutes, deadline: q.deadline })
    .from(a)
    .innerJoin(q, eq(q.id, a.quizId))
    .where(
      and(
        inScope,
        isNull(a.submittedAt),
        sql`now() > least(${a.startedAt} + ${q.timeLimitMinutes} * interval '1 minute', ${q.deadline}) + ${`${GRACE_MS} milliseconds`}::interval`,
      ),
    );
  for (const row of expired) await finalizeAttempt(row.id, attemptEndsAt(row, row));
}

/** Points possible per quiz: fixed questions' points + each random slot's picks × points. */
export async function quizPossible(quizIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>(quizIds.map((id) => [id, 0]));
  if (quizIds.length === 0) return result;
  const q = schema.questions;
  const s = schema.quizSlots;
  const [fixed, slots] = await Promise.all([
    db
      .select({ quizId: q.quizId, n: sql<number>`coalesce(sum(${q.points}), 0)`.mapWith(Number) })
      .from(q)
      .where(and(inArray(q.quizId, quizIds), isNull(q.slotId)))
      .groupBy(q.quizId),
    db
      .select({ quizId: s.quizId, n: sql<number>`coalesce(sum(${s.pickCount} * ${s.points}), 0)`.mapWith(Number) })
      .from(s)
      .where(inArray(s.quizId, quizIds))
      .groupBy(s.quizId),
  ]);
  for (const r of [...fixed, ...slots]) result.set(r.quizId, (result.get(r.quizId) ?? 0) + r.n);
  return result;
}
