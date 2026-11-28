/**
 * Question types, answer checking and attempt grading methods (Phase 3, 4.4).
 *
 * Pure module (no database, no server-only imports): the same validation runs for the
 * question bank and quiz questions, and every rule is unit-tested in
 * tests/unit/questions.test.ts. Grading itself only ever runs on the server
 * (src/lib/quiz-engine.ts); the browser never receives an answer key before the deadline.
 */
import { z } from "zod";

export const QUESTION_TYPES = ["single", "multiple", "true_false", "short_answer", "numerical"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  single: "Single choice",
  multiple: "Multiple answer",
  true_false: "True / false",
  short_answer: "Short answer",
  numerical: "Numerical",
};

export const GRADING_METHODS = ["highest", "average", "first", "last"] as const;
export type GradingMethod = (typeof GRADING_METHODS)[number];

export const GRADING_METHOD_LABEL: Record<GradingMethod, string> = {
  highest: "Highest attempt",
  average: "Average of attempts",
  first: "First attempt",
  last: "Last attempt",
};

/** The options a true/false question always has (index 0 = True). */
export const TRUE_FALSE_OPTIONS = ["True", "False"];

export const MAX_ATTEMPTS = 10;

/* ------------------------------ validation ------------------------------ */

const option = z.string().trim().min(1, "Options cannot be empty.").max(300);
const prompt = z.string().trim().min(1, "Every question needs text.").max(1000);
const explanation = z.string().trim().max(1000).optional();
const points = z.coerce.number().int("Points must be a whole number.").min(1, "Points must be at least 1.").max(100, "At most 100 points per question.").default(1);

/**
 * One question as sent by the quiz builder or the bank editor. `type` defaults to single
 * choice, so payloads from before 4.4 ({prompt, options, correctIndex}) still validate.
 */
export const questionFields = z.object({
  type: z.enum(QUESTION_TYPES).default("single"),
  prompt,
  options: z.array(option).max(6, "At most 6 options.").default([]),
  correctIndex: z.number().int().min(0).nullish(),
  correctIndexes: z.array(z.number().int().min(0).max(5)).max(6).nullish(),
  acceptedAnswers: z.array(z.string().trim().max(200)).max(20, "At most 20 accepted answers.").nullish(),
  numericAnswer: z.number().finite("Enter the correct number.").nullish(),
  tolerance: z.number().finite().min(0, "Tolerance can't be negative.").nullish(),
  points,
  explanation,
});

type QuestionFields = z.output<typeof questionFields>;

/** Type-specific completeness rules (use with .superRefine on questionFields or an extension). */
export function checkQuestion(q: QuestionFields, ctx: z.RefinementCtx) {
  {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    switch (q.type) {
      case "single":
        if (q.options.length < 2) issue("Each question needs at least 2 options.");
        else if (q.correctIndex == null || q.correctIndex >= q.options.length) issue("Pick a correct option for every question.");
        break;
      case "true_false":
        if (q.correctIndex !== 0 && q.correctIndex !== 1) issue("Choose whether the statement is true or false.");
        break;
      case "multiple": {
        const picked = new Set(q.correctIndexes ?? []);
        if (q.options.length < 2) issue("Each question needs at least 2 options.");
        else if (picked.size === 0) issue("Tick at least one correct option for every multiple-answer question.");
        else if ([...picked].some((i) => i >= q.options.length)) issue("A correct option is out of range.");
        break;
      }
      case "short_answer":
        if (!(q.acceptedAnswers ?? []).some((a) => normalizeShortAnswer(a) !== "")) issue("Add at least one accepted answer.");
        break;
      case "numerical":
        if (q.numericAnswer == null) issue("Enter the correct number.");
        break;
    }
  }
}

/** One question, validated and reduced to the columns its type uses. */
export const questionInput = questionFields.superRefine(checkQuestion).transform((q) => toQuestionColumns(q));

export type QuestionInput = z.input<typeof questionInput>;
export type QuestionColumns = {
  type: QuestionType;
  prompt: string;
  options: string[];
  correctIndex: number | null;
  correctIndexes: number[] | null;
  acceptedAnswers: string[] | null;
  numericAnswer: number | null;
  tolerance: number | null;
  points: number;
  explanation: string | null;
};

/** Keeps only the answer-key columns the type uses (the database CHECK expects that shape). */
export function toQuestionColumns(q: QuestionFields): QuestionColumns {
  const base = {
    type: q.type,
    prompt: q.prompt,
    options: [] as string[],
    correctIndex: null as number | null,
    correctIndexes: null as number[] | null,
    acceptedAnswers: null as string[] | null,
    numericAnswer: null as number | null,
    tolerance: null as number | null,
    points: q.points,
    explanation: q.explanation || null,
  };
  switch (q.type) {
    case "single":
      return { ...base, options: q.options, correctIndex: q.correctIndex ?? 0 };
    case "true_false":
      return { ...base, options: [...TRUE_FALSE_OPTIONS], correctIndex: q.correctIndex ?? 0 };
    case "multiple":
      return { ...base, options: q.options, correctIndexes: [...new Set(q.correctIndexes ?? [])].sort((a, b) => a - b) };
    case "short_answer": {
      const seen = new Set<string>();
      const accepted = (q.acceptedAnswers ?? [])
        .map((a) => a.trim().replace(/\s+/g, " "))
        .filter((a) => a !== "" && !seen.has(normalizeShortAnswer(a)) && seen.add(normalizeShortAnswer(a)));
      return { ...base, acceptedAnswers: accepted };
    }
    case "numerical":
      return { ...base, numericAnswer: q.numericAnswer ?? 0, tolerance: q.tolerance ?? 0 };
  }
}

/** Free-text tags: comma separated, trimmed, lower-cased, de-duplicated, at most 10. */
export function parseTags(raw: string): string[] {
  return [...new Set(raw.split(",").map((t) => t.trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean))].map((t) => t.slice(0, 40)).slice(0, 10);
}

/* -------------------------------- grading -------------------------------- */

export type AnswerKey = Pick<QuestionColumns, "type" | "correctIndex" | "correctIndexes" | "acceptedAnswers" | "numericAnswer" | "tolerance">;
export type Response = { selectedIndex: number | null; selectedIndexes: number[] | null; textAnswer: string | null; numberAnswer: number | null };

/** Short answers match when equal after trimming, collapsing whitespace and ignoring case. */
export function normalizeShortAnswer(s: string): string {
  return s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Is this stored response right? (Server-side only: callers hold the answer key.) */
export function isCorrect(q: AnswerKey, r: Response | null | undefined): boolean {
  if (!r) return false;
  switch (q.type) {
    case "single":
    case "true_false":
      return r.selectedIndex != null && r.selectedIndex === q.correctIndex;
    case "multiple": {
      // All-or-nothing: exactly the set of correct options, no more and no fewer.
      const want = [...new Set(q.correctIndexes ?? [])].sort((a, b) => a - b);
      const got = [...new Set(r.selectedIndexes ?? [])].sort((a, b) => a - b);
      return want.length > 0 && want.length === got.length && want.every((v, i) => v === got[i]);
    }
    case "short_answer": {
      if (r.textAnswer == null) return false;
      const given = normalizeShortAnswer(r.textAnswer);
      return given !== "" && (q.acceptedAnswers ?? []).some((a) => normalizeShortAnswer(a) === given);
    }
    case "numerical": {
      if (r.numberAnswer == null || q.numericAnswer == null || !Number.isFinite(r.numberAnswer)) return false;
      const tolerance = Math.max(q.tolerance ?? 0, 0);
      // A tiny relative epsilon so 0.1 + 0.2 style float noise never flips a boundary answer.
      const epsilon = 1e-9 * Math.max(1, Math.abs(q.numericAnswer));
      return Math.abs(r.numberAnswer - q.numericAnswer) <= tolerance + epsilon;
    }
  }
}

/** Score of one attempt: the points of every question it was given and answered correctly. */
export function scoreAttempt(given: (AnswerKey & { id: string; points: number })[], answers: Map<string, Response>): number {
  return given.reduce((sum, q) => sum + (isCorrect(q, answers.get(q.id)) ? q.points : 0), 0);
}

export type FinishedAttempt = { attemptNumber: number; score: number; total: number };

/**
 * The value that counts for a student with several finished attempts. `average` is the
 * mean score rounded to 2 decimals. null when there is no finished attempt.
 */
export function gradedResult(attempts: FinishedAttempt[], method: GradingMethod): { score: number; total: number } | null {
  if (attempts.length === 0) return null;
  const byNumber = [...attempts].sort((a, b) => a.attemptNumber - b.attemptNumber);
  const total = Math.max(...byNumber.map((a) => a.total));
  switch (method) {
    case "first":
      return { score: byNumber[0].score, total: byNumber[0].total };
    case "last": {
      const last = byNumber[byNumber.length - 1];
      return { score: last.score, total: last.total };
    }
    case "average":
      return { score: Math.round((byNumber.reduce((s, a) => s + a.score, 0) / byNumber.length) * 100) / 100, total };
    case "highest": {
      const best = byNumber.reduce((b, a) => (a.score / Math.max(a.total, 1) > b.score / Math.max(b.total, 1) ? a : b));
      return { score: best.score, total: best.total };
    }
  }
}

/** A one-line summary of the answer key, for staff lists (never shown to students). */
export function answerSummary(q: Pick<QuestionColumns, "type" | "options" | "correctIndex" | "correctIndexes" | "acceptedAnswers" | "numericAnswer" | "tolerance">): string {
  switch (q.type) {
    case "single":
    case "true_false":
      return q.correctIndex == null ? "" : (q.options[q.correctIndex] ?? "");
    case "multiple":
      return (q.correctIndexes ?? []).map((i) => q.options[i]).join(" + ");
    case "short_answer":
      return (q.acceptedAnswers ?? []).join(" | ");
    case "numerical":
      return `${q.numericAnswer} ± ${q.tolerance ?? 0}`;
  }
}