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
      .select({ id: schema.attempts.id, submittedAt: schema.attempts.submittedAt })
      .from(schema.attempts)
      .where(eq(schema.attempts.id, attemptId))
      .for("update");
    if (!attempt || attempt.submittedAt) return;

    const [{ correct }] = await tx
      .select({ correct: count() })
      .from(schema.answers)
      .innerJoin(schema.questions, eq(schema.answers.questionId, schema.questions.id))
      .where(and(eq(schema.answers.attemptId, attemptId), eq(schema.answers.selectedIndex, schema.questions.correctIndex)));

    await tx
      .update(schema.attempts)
      .set({ submittedAt: endedAt ?? sql`now()`, score: correct })
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
