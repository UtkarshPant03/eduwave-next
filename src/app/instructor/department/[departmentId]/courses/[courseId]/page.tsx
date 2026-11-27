import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CourseOfferingView } from "@/components/institution/course-offering";
import { db } from "@/db";
import { requireInstructor } from "@/lib/auth/dal";
import { departmentOf, managesDepartment } from "@/lib/auth/scope";
import { routeIds } from "@/lib/route-ids";

export const metadata: Metadata = { title: "Course offering" };

export default async function DepartmentCoursePage({ params }: PageProps<"/instructor/department/[departmentId]/courses/[courseId]">) {
  const { departmentId, courseId } = routeIds(await params);
  const user = await requireInstructor();
  // Must manage the department, and the course must belong to it (no cross-department access via the URL).
  if (!(await managesDepartment(user, departmentId)) || (await departmentOf("course", courseId)) !== departmentId) notFound();
  const dept = await db.query.departments.findFirst({ where: (d, { eq }) => eq(d.id, departmentId), columns: { name: true } });
  return (
    <CourseOfferingView
      courseId={courseId}
      only={[departmentId]}
      breadcrumbs={[{ label: dept?.name ?? "Department", href: `/instructor/department/${departmentId}` }]}
    />
  );
}
