import type { Metadata } from "next";
import { CourseOfferingView } from "@/components/institution/course-offering";
import { requireAdmin } from "@/lib/auth/dal";
import { routeIds } from "@/lib/route-ids";

export const metadata: Metadata = { title: "Course" };

export default async function AdminCoursePage({ params }: PageProps<"/admin/courses/[courseId]">) {
  const { courseId } = routeIds(await params);
  await requireAdmin();
  return <CourseOfferingView courseId={courseId} breadcrumbs={[{ label: "Courses", href: "/admin/courses" }]} />;
}
