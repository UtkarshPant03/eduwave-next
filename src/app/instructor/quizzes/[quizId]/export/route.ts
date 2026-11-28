import { getActiveUser } from "@/lib/auth/dal";
import { csvResponse } from "@/lib/csv";
import { getQuizAnalytics } from "@/lib/data/assessments";
import { GRADING_METHOD_LABEL } from "@/lib/questions";
import { routeIds } from "@/lib/route-ids";

export async function GET(_: Request, ctx: RouteContext<"/instructor/quizzes/[quizId]/export">) {
  const user = await getActiveUser();
  if (!user || user.role !== "instructor") return new Response("Unauthorized", { status: 401 });
  const { quizId } = routeIds(await ctx.params);
  // getQuizAnalytics checks the quiz belongs to this instructor (404 otherwise).
  const { quiz, results } = await getQuizAnalytics(user, quizId);
  // One row per student. "Score" is the value that counts (the quiz's grading method), as
  // in the gradebook; every finished attempt's score is listed alongside.
  return csvResponse(`${quiz.title}-results`, [
    ["Student ID", "Name", "Score", "Total", "Percent", "Grading method", "Attempts", "Attempt scores", "Started", "Submitted"],
    ...results.map((r) => [
      r.studentId,
      r.name,
      r.score ?? "",
      r.total,
      r.score != null ? Math.round((r.score / Math.max(r.total, 1)) * 100) : "",
      GRADING_METHOD_LABEL[quiz.gradingMethod],
      r.attempts.length,
      r.attempts.map((a) => (a.submittedAt ? `${a.score}` : "in progress")).join("; "),
      r.startedAt.toISOString(),
      r.submittedAt?.toISOString() ?? "in progress",
    ]),
  ]);
}
