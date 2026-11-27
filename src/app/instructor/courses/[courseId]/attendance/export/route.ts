import { courseForInstructor } from "@/lib/access";
import { getActiveUser } from "@/lib/auth/dal";
import { csvResponse } from "@/lib/csv";
import { courseAttendanceSummary } from "@/lib/data/attendance";
import { routeIds } from "@/lib/route-ids";

/** Attendance summary as CSV (one row per student). */
export async function GET(_: Request, ctx: RouteContext<"/instructor/courses/[courseId]/attendance/export">) {
  const user = await getActiveUser();
  if (!user || user.role !== "instructor") return new Response("Unauthorized", { status: 401 });
  const { courseId } = routeIds(await ctx.params);
  const course = await courseForInstructor(user, courseId, "attendance.mark");
  const { rows, settings } = await courseAttendanceSummary(course.id);
  return csvResponse(`${course.code}-attendance`, [
    ["Student ID", "Name", "Present", "Late", "Absent", "Excused", "Attendance %", `Below minimum (${settings.thresholdPercent ?? "none"})`],
    ...rows.map((r) => [
      r.universityId,
      r.name,
      r.present,
      r.late,
      r.absent,
      r.excused,
      r.percent == null ? "" : r.percent.toFixed(1),
      settings.thresholdPercent != null && r.percent != null && r.percent < settings.thresholdPercent ? "yes" : "",
    ]),
  ]);
}
