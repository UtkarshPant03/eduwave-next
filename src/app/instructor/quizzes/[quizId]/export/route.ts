import { getCurrentUser } from "@/lib/auth/dal";
import { csvResponse } from "@/lib/csv";
import { getQuizAnalytics } from "@/lib/data/assessments";

export async function GET(_: Request, ctx: RouteContext<"/instructor/quizzes/[quizId]/export">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "instructor") return new Response("Unauthorized", { status: 401 });
  const { quizId } = await ctx.params;
  // getQuizAnalytics checks the quiz belongs to this instructor (404 otherwise).
  const { quiz, results } = await getQuizAnalytics(user, quizId);
  return csvResponse(`${quiz.title}-results`, [
    ["Student ID", "Name", "Score", "Total", "Percent", "Started", "Submitted"],
    ...results.map((r) => [
      r.studentId,
      r.name,
      r.score,
      r.total,
      r.submittedAt && r.score != null ? Math.round((r.score / r.total) * 100) : "",
      r.startedAt.toISOString(),
      r.submittedAt?.toISOString() ?? "in progress",
    ]),
  ]);
}
