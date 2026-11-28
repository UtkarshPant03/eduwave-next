import type { Metadata } from "next";
import Link from "next/link";
import { FolderPlus, Library, Share2 } from "lucide-react";
import { createCategory } from "@/app/actions/question-bank";
import { ActionForm } from "@/components/action-form";
import { BankQuestionActions, CategoryActions, NewBankQuestion } from "@/components/client/question-bank";
import { BankFilterForm } from "@/components/course/bank-filter";
import { Badge, Card, Empty, Field, Input, PageHeader } from "@/components/ui";
import { requireInstructor } from "@/lib/auth/dal";
import { bankFilters, getBank } from "@/lib/data/question-bank";
import { answerSummary, QUESTION_TYPE_LABEL } from "@/lib/questions";
import { routeIds } from "@/lib/route-ids";

export const metadata: Metadata = { title: "Question bank" };

export default async function QuestionBankPage({ params, searchParams }: PageProps<"/instructor/courses/[courseId]/bank">) {
  const { courseId } = routeIds(await params);
  const filters = bankFilters(await searchParams);
  const user = await requireInstructor();
  const { course, canManage, categories, questions, tags, shared } = await getBank(user, courseId, filters);
  const filtered = Boolean(filters.category || filters.tag || filters.type || filters.q);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "My courses", href: "/instructor/courses" }, { label: course.code, href: `/instructor/courses/${course.id}` }, { label: "Question bank" }]}
        eyebrow="Question bank"
        title={`${course.code} question bank`}
        subtitle={
          canManage
            ? "Reusable questions for this course's quizzes. A quiz gets a copy, so editing a bank question never changes a quiz students have started."
            : "Read-only: only staff who manage the course can change the bank."
        }
        action={canManage && <NewBankQuestion courseId={course.id} categories={categories} />}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem] [&>*]:min-w-0">
        <div className="space-y-4">
          <BankFilterForm action={`/instructor/courses/${course.id}/bank`} categories={categories} tags={tags} filters={filters} />
          <Card title={filtered ? `${questions.length} matching question${questions.length === 1 ? "" : "s"}` : `${questions.length} question${questions.length === 1 ? "" : "s"}`} icon={<Library />}>
            {questions.length === 0 ? (
              <Empty icon={<Library />}>
                {filtered ? "No questions match these filters." : categories.length === 0 ? "Create a category, then add questions to it." : "No questions yet."}
              </Empty>
            ) : (
              <ul className="divide-y divide-border">
                {questions.map((q) => (
                  <li key={q.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{q.prompt}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">
                        <Badge>{q.category}</Badge>
                        <Badge>{QUESTION_TYPE_LABEL[q.type]}</Badge>
                        <Badge>{q.points} pt{q.points === 1 ? "" : "s"}</Badge>
                        {q.tags.map((t) => <Badge key={t} tone="accent">{t}</Badge>)}
                        {q.usedInQuizzes > 0 && <span>Copied into {q.usedInQuizzes} quiz{q.usedInQuizzes === 1 ? "" : "zes"}</span>}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted">Answer: {answerSummary(q)}</p>
                    </div>
                    {canManage && <BankQuestionActions courseId={course.id} categories={categories} question={q} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Categories" icon={<FolderPlus />} description="Random quiz questions are drawn from one category.">
            {categories.length === 0 ? (
              <p className="text-sm text-muted">No categories yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {categories.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <Link href={`/instructor/courses/${course.id}/bank?category=${c.id}`} className="min-w-0 truncate hover:underline">
                      {c.name} <span className="text-muted tabular-nums">({c.questions})</span>
                    </Link>
                    {canManage && <CategoryActions courseId={course.id} category={c} />}
                  </li>
                ))}
              </ul>
            )}
            {canManage && (
              <div className="mt-4 border-t border-border pt-4">
                <ActionForm action={createCategory} submitLabel="Create category">
                  <input type="hidden" name="courseId" value={course.id} />
                  <Field label="New category"><Input name="name" required maxLength={80} placeholder="e.g. Trees" /></Field>
                </ActionForm>
              </div>
            )}
          </Card>
          {canManage && (
            <Card title="Shared in your department" icon={<Share2 />} description="Browse banks of other courses in the same department and copy questions into this one.">
              {!course.departmentId ? (
                <p className="text-sm text-muted">This course isn&apos;t linked to a department, so there are no shared banks.</p>
              ) : shared.length === 0 ? (
                <p className="text-sm text-muted">No other courses in this department.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {shared.map((c) => (
                    <li key={c.id}>
                      <Link href={`/instructor/courses/${course.id}/bank/shared/${c.id}`} className="hover:underline">
                        {c.code} · {c.title}
                      </Link>{" "}
                      <span className="text-xs text-muted">({c.term}, {c.questions} question{c.questions === 1 ? "" : "s"})</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
