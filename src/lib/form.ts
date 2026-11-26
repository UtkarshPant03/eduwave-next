import type { z } from "zod";

/** Shape returned by Server Actions used with useActionState. */
export type FormState = { error?: string; success?: string } | undefined;

/** First validation message, suitable for showing under a form. */
export function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid input.";
}
