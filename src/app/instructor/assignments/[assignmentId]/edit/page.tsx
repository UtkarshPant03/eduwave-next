import type { Metadata } from "next";
import { AssignmentBuilder } from "@/components/client/assignment-builder";
import { PageHeader } from "@/components/ui";
import { requireInstructor } from "@/lib/auth/dal";
import { getAssignmentForEdit } from "@/lib/data/assessments";
import { listSections } from "@/lib/data/courses";
import { gradeCategoryChoice } from "@/lib/data/gradebook";
import { routeIds } from "@/lib/route-ids";

export const metadata: Metadata = { title: "Edit assignment" };

export default async function EditAssignmentPage({ params }: PageProps<"/instructor/assignments/[assignmentId]/edit">) {
  const { assignmentId } = routeIds(await params);
  const user = await requireInstructor();
  const { course, assignment, topGrade, submitted } = await getAssignmentForEdit(user, assignmentId);
  const [sections, gradeCategories] = await Promise.all([listSections(course.id), gradeCategoryChoice(course.id)]);
  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "My courses", href: "/instructor/courses" },
          { label: course.code, href: `/instructor/courses/${course.id}` },
          { label: assignment.title, href: `/instructor/assignments/${assignment.id}` },
          { label: "Edit" },
        ]}
        title="Edit assignment"
        subtitle={
          submitted > 0
            ? `${submitted} submission${submitted === 1 ? "" : "s"} so far. Students are notified if you change the due date or late window.`
            : "Students are notified if you change the due date or late window."
        }
      />
      <AssignmentBuilder
        courseId={course.id}
        sections={sections}
        minPoints={Math.max(1, topGrade ?? 1)}
        gradeCategories={gradeCategories}
        initial={{
          id: assignment.id,
          title: assignment.title,
          instructions: assignment.instructions,
          sectionId: assignment.sectionId,
          dueAt: assignment.dueAt.toISOString(),
          maxPoints: assignment.maxPoints,
          lateDays: assignment.lateDays,
          maxFiles: assignment.maxFiles,
          gradeCategoryId: assignment.gradeCategoryId,
        }}
      />
    </>
  );
}
