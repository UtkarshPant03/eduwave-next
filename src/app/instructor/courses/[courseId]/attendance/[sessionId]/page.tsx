import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AttendanceSheet } from "@/components/client/attendance";
import { Card, PageHeader } from "@/components/ui";
import { courseForInstructor } from "@/lib/access";
import { requireInstructor } from "@/lib/auth/dal";
import { sessionRoster } from "@/lib/data/attendance";
import { formatDateTime } from "@/lib/format";
import { routeIds } from "@/lib/route-ids";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendanceSessionPage({ params }: PageProps<"/instructor/courses/[courseId]/attendance/[sessionId]">) {
  const { courseId, sessionId } = routeIds(await params);
  const user = await requireInstructor();
  const course = await courseForInstructor(user, courseId, "attendance.mark");
  const data = await sessionRoster(sessionId);
  if (!data || data.session.courseId !== course.id) notFound();
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "My courses", href: "/instructor/courses" }, { label: course.code, href: `/instructor/courses/${course.id}` }, { label: "Attendance" }]}
        title={`Attendance · ${formatDateTime(data.session.heldAt)}`}
        subtitle={data.session.topic ?? `${course.code} · ${course.title}`}
      />
      <Card>
        <AttendanceSheet sessionId={data.session.id} roster={data.roster} />
      </Card>
    </>
  );
}
