import { courseForInstructor } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth/dal";
import { csvResponse } from "@/lib/csv";
import { gradebook } from "@/lib/data/gradebook";

/** Gradebook as CSV (one row per student, one column per graded item). */
export async function GET(_: Request, ctx: RouteContext<"/instructor/courses/[courseId]/gradebook/export">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "instructor") return new Response("Unauthorized", { status: 401 });
  const { courseId } = await ctx.params;
  const course = await courseForInstructor(user, courseId);
  const book = await gradebook(course.id);
  const rows: unknown[][] = [
    ["Student ID", "Name", "Email", ...book.items.map((i) => `${i.title} (/${i.possible})`), "Points", "Possible", "Percent", "Grade"],
    ...book.rows.map((r) => [
      r.student.studentId,
      r.student.name,
      r.student.email,
      ...book.items.map((i) => (r.cells[i.id].status === "submitted" ? "ungraded" : r.cells[i.id].earned ?? "")),
      r.total.earned,
      r.total.possible,
      r.total.percent == null ? "" : Math.round(r.total.percent * 10) / 10,
      r.total.letter?.letter ?? "",
    ]),
  ];
  return csvResponse(`${course.code}-${course.term}-gradebook`, rows);
}
