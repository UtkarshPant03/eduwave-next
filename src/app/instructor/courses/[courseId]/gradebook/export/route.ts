import { courseForInstructor } from "@/lib/access";
import { getActiveUser } from "@/lib/auth/dal";
import { csvResponse } from "@/lib/csv";
import { gradebook } from "@/lib/data/gradebook";
import { routeIds } from "@/lib/route-ids";

const pct = (p: number | null) => (p == null ? "" : Math.round(p * 10) / 10);

/**
 * Gradebook as CSV (one row per student, one column per graded item). Staff only: every
 * item is included, released or not. Item headers name the category and mark unreleased
 * items; overridden values are the values that count, listed in the "Overridden" column.
 */
export async function GET(_: Request, ctx: RouteContext<"/instructor/courses/[courseId]/gradebook/export">) {
  const user = await getActiveUser();
  if (!user || user.role !== "instructor") return new Response("Unauthorized", { status: 401 });
  const { courseId } = routeIds(await ctx.params);
  const course = await courseForInstructor(user, courseId, "grade.view");
  const book = await gradebook(course.id, { audience: "staff" });
  const categoryName = new Map(book.categories.map((c) => [c.id, c.name]));
  const weighted = book.method === "weighted";
  const itemHeader = (i: (typeof book.items)[number]) =>
    [`${i.title} (/${i.possible})`, i.categoryId ? `[${categoryName.get(i.categoryId)}]` : null, i.released ? null : "[not released]"].filter(Boolean).join(" ");
  const rows: unknown[][] = [
    [
      "Student ID",
      "Name",
      "Email",
      ...book.items.map(itemHeader),
      ...book.categories.map((c) => (weighted ? `${c.name} % (weight ${c.weight}%)` : `${c.name} %`)),
      "Points",
      "Possible",
      weighted ? "Weighted percent" : "Percent",
      "Grade",
      "Overridden",
    ],
    ...book.rows.map((r) => [
      r.student.studentId,
      r.student.name,
      r.student.email,
      ...book.items.map((i) => (r.cells[i.id].overridden ? r.cells[i.id].earned : r.cells[i.id].status === "submitted" ? "ungraded" : (r.cells[i.id].earned ?? ""))),
      ...r.total.categories.map((c) => pct(c.percent)),
      r.total.earned,
      r.total.possible,
      pct(r.total.percent),
      r.total.letter?.letter ?? "",
      [...book.items.filter((i) => r.cells[i.id].overridden).map((i) => i.title), ...(r.total.overridden ? ["course total"] : [])].join("; "),
    ]),
  ];
  return csvResponse(`${course.code}-${course.term}-gradebook`, rows);
}
