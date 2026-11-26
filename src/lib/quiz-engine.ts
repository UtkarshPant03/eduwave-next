/**
 * Quiz rules. This is the main fix over the original app, where the browser
 * computed the score and the server trusted it.
 *
 * - The server records when an attempt starts; the timer is derived from that.
 * - Answers are saved one at a time and rejected once time is up.
 * - Grading compares stored answers with stored correct answers, in SQL.
 * - Finalising is idempotent: submit, expiry and page loads can all call it safely.
 */
import "server-only";
import { randomInt } from "node:crypto";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AttemptLayout } from "@/db/schema";

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1); // crypto RNG: order can't be predicted from Math.random state
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Fixes the question and option order for one attempt (identity order if shuffle is off). */
export function buildLayout(qs: { id: string; options: string[] }[], shuffle: boolean): AttemptLayout {
  const order = (n: number) => Array.from({ length: n }, (_, i) => i);
  return {
    questionOrder: shuffle ? shuffled(qs.map((q) => q.id)) : qs.map((q) => q.id),
    optionOrders: Object.fromEntries(
      qs.map((q) => [q.id, shuffle ? shuffled(order(q.options.length)) : order(q.options.length)]),
    ),
  };
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

/** Grades and closes an attempt. Does nothing if it was already submitted. */
export async function finalizeAttempt(attemptId: string) {
  const [{ correct }] = await db
    .select({ correct: count() })
    .from(schema.answers)
    .innerJoin(schema.questions, eq(schema.answers.questionId, schema.questions.id))
    .where(
      and(
        eq(schema.answers.attemptId, attemptId),
        eq(schema.answers.selectedIndex, schema.questions.correctIndex),
      ),
    );

  // `submittedAt IS NULL` makes this safe against double-submits and races.
  await db
    .update(schema.attempts)
    .set({ submittedAt: sql`now()`, score: correct })
    .where(and(eq(schema.attempts.id, attemptId), isNull(schema.attempts.submittedAt)));
}

/** Call before showing an attempt: closes it if the student ran out of time. */
export async function finalizeIfExpired(
  attempt: AttemptTiming & { id: string; submittedAt: Date | null },
  quiz: QuizTiming,
) {
  if (!attempt.submittedAt && !isAttemptOpen(attempt, quiz)) {
    await finalizeAttempt(attempt.id);
    return true;
  }
  return false;
}
