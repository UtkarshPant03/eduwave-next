import { getCurrentUser } from "@/lib/auth/dal";
import { getQuizAnalytics } from "@/lib/data";

/**
 * CSV formula injection: a cell like `=HYPERLINK(...)` executes when the CSV is opened
 * in Excel/Sheets. Prefixing such cells with an apostrophe makes them plain text.
 */
function cell(value: unknown) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(_: Request, ctx: RouteContext<"/teacher/quizzes/[quizId]/export">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "teacher") return new Response("Unauthorized", { status: 401 });
  const { quizId } = await ctx.params;
  // getQuizAnalytics checks the quiz belongs to this teacher (404 otherwise).
  const { quiz, results } = await getQuizAnalytics(user.id, quizId);

  const rows = [
    ["Roll number", "Name", "Score", "Total", "Percent", "Started", "Submitted"],
    ...results.map((r) => [
      r.rollNumber,
      r.name,
      r.score,
      r.total,
      r.submittedAt && r.score != null ? Math.round((r.score / r.total) * 100) : "",
      r.startedAt.toISOString(),
      r.submittedAt?.toISOString() ?? "in progress",
    ]),
  ];
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n"); // BOM so Excel reads UTF-8
  const filename = `${quiz.title.replace(/[^\w-]+/g, "_")}-results.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
