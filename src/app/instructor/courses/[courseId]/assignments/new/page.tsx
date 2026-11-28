import { AssignmentBuilder } from "@/components/client/assignment-builder";
import { PageHeader } from "@/components/ui";
import { courseForInstructor } from "@/lib/access";
import { requireInstructor } from "@/lib/auth/dal";
import { listSections } from "@/lib/data/courses";
import { gradeCategoryChoice } from "@/lib/data/gradebook";
import { routeIds } from "@/lib/route-ids";

export default async function NewAssignmentPage({ params }: PageProps<"/instructor/courses/[courseId]/assignments/new">) {
  const { courseId } = routeIds(await params);
  const user = await requireInstructor();
  const course = await courseForInstructor(user, courseId);
  const [sections, gradeCategories] = await Promise.all([listSections(course.id), gradeCategoryChoice(course.id)]);
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "My courses", href: "/instructor/courses" }, { label: course.code, href: `/instructor/courses/${course.id}` }, { label: "New assignment" }]}
        title="New assignment"
        subtitle="Students are notified as soon as you publish."
      />
      <AssignmentBuilder courseId={course.id} sections={sections} gradeCategories={gradeCategories} />
    </>
  );
}
