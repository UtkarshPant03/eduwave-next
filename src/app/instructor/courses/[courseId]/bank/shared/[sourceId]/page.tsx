import type { Metadata } from "next";
import { Library } from "lucide-react";
import { CopyFromBank } from "@/components/client/question-bank";
import { BankFilterForm } from "@/components/course/bank-filter";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireInstructor } from "@/lib/auth/dal";
import { bankFilters, getSharedBank } from "@/lib/data/question-bank";
import { routeIds } from "@/lib/route-ids";

export const metadata: Metadata = { title: "Shared question bank" };

/**
 * Another course's bank, in the same department as this course. getSharedBank 404s for
 * courses of other departments, courses without a department, and staff who can't manage
 * this course, so nothing outside the department is ever shown.
 */
export default async function SharedBankPage({ params, searchParams }: PageProps<"/instructor/courses/[courseId]/bank/shared/[sourceId]">) {
  const { courseId, sourceId } = routeIds(await params);
  const filters = bankFilters(await searchParams);
  const user = await requireInstructor();
  const { course, source, categories, questions, tags, ownCategories } = await getSharedBank(user, courseId, sourceId, filters);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "My courses", href: "/instructor/courses" },
          { label: course.code, href: `/instructor/courses/${course.id}` },
          { label: "Question bank", href: `/instructor/courses/${course.id}/bank` },
          { label: source.code },
        ]}
        eyebrow="Shared in your department"
        title={`${source.code} question bank`}
        subtitle={`${source.title} · ${source.term}. Copy questions into ${course.code}: a copy is independent, later edits on either side don't affect the other.`}
      />
      <div className="space-y-4">
        <BankFilterForm action={`/instructor/courses/${course.id}/bank/shared/${source.id}`} categories={categories} tags={tags} filters={filters} />
        <Card title={`${questions.length} question${questions.length === 1 ? "" : "s"}`} icon={<Library />}>
          {questions.length === 0 ? (
            <Empty icon={<Library />}>No questions here{filters.q || filters.category || filters.tag || filters.type ? " match these filters" : " yet"}.</Empty>
          ) : (
            <CopyFromBank courseId={course.id} sourceCourseId={source.id} questions={questions} ownCategories={ownCategories} />
          )}
        </Card>
      </div>
    </>
  );
}
