import type { Metadata } from "next";
import { ClipboardList, NotebookPen, Scale, SlidersHorizontal, Tags } from "lucide-react";
import { saveGradeItems } from "@/app/actions/gradebook";
import { ActionForm } from "@/components/action-form";
import { GradeCategoriesForm, GradeScaleEditor } from "@/components/client/gradebook-setup";
import { Card, Empty, PageHeader, Select } from "@/components/ui";
import { courseForInstructor } from "@/lib/access";
import { requireInstructor } from "@/lib/auth/dal";
import { gradebookSetup } from "@/lib/data/gradebook";
import { formatDateTime } from "@/lib/format";
import { routeIds } from "@/lib/route-ids";

export const metadata: Metadata = { title: "Gradebook setup" };

/**
 * Gradebook setup (staff with course.manage): how the course total is calculated, the
 * categories and weights, each item's category and release, and the grade scale. Nothing
 * here is university policy (decision D4 is open): the defaults reproduce the pre-4.6 gradebook.
 */
export default async function GradebookSetupPage({ params }: PageProps<"/instructor/courses/[courseId]/gradebook/setup">) {
  const { courseId } = routeIds(await params);
  const user = await requireInstructor();
  const course = await courseForInstructor(user, courseId, "course.manage");
  const setup = await gradebookSetup(course.id);
  const weighted = setup.method === "weighted";

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "My courses", href: "/instructor/courses" },
          { label: course.code, href: `/instructor/courses/${course.id}#gradebook` },
          { label: "Gradebook setup" },
        ]}
        title="Gradebook setup"
        subtitle="How this course's total and letter grades are calculated. These are the course's own choices, not a university scheme: the defaults (sum of points, 10-point scale, all grades released) are what eduWave did before."
      />
      <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        <Card title="Total and categories" icon={<SlidersHorizontal />}>
          <GradeCategoriesForm key={JSON.stringify([setup.method, setup.categories])} courseId={course.id} method={setup.method} categories={setup.categories} />
        </Card>
        <Card title="Grade scale" icon={<Scale />} description="Letters, the percentage each starts at, and grade points (used for the provisional GPA students see).">
          <GradeScaleEditor key={JSON.stringify(setup.scale)} courseId={course.id} scale={setup.scale} />
        </Card>
      </div>

      <Card
        className="mt-6"
        title="Items: category and release"
        icon={<Tags />}
        description="Students see an item's grades, feedback and answers only while its grades are released. Unreleased items show &quot;Not released&quot; to students and don't count in the total they see; staff views and exports are unchanged. Students are notified when you release an item."
      >
        {setup.items.length === 0 ? (
          <Empty>No assignments or quizzes yet.</Empty>
        ) : (
          <div key={JSON.stringify(setup.items.map((i) => [i.id, i.categoryId, i.released]))}>
            <ActionForm action={saveGradeItems} submitLabel="Save items" toastOnSuccess>
              <input type="hidden" name="courseId" value={course.id} />
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border-strong text-xs text-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2.5 font-semibold">Item</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">Due</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">Category</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">Grades released</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {setup.items.map((it) => (
                      <tr key={it.id}>
                        <td className="px-3 py-2">
                          <input type="hidden" name="item" value={`${it.kind}:${it.id}`} />
                          <span className="flex items-center gap-1.5 font-medium">
                            {it.kind === "assignment" ? <NotebookPen className="size-3.5 text-muted" aria-hidden /> : <ClipboardList className="size-3.5 text-muted" aria-hidden />}
                            {it.title}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDateTime(it.due)}</td>
                        <td className="px-3 py-2">
                          <Select name={`category:${it.id}`} defaultValue={it.categoryId ?? ""} aria-label={`Category for ${it.title}`} className="w-48">
                            {(!weighted || !it.categoryId) && <option value="">None</option>}
                            {setup.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          <label className="flex items-center gap-2">
                            <input type="checkbox" name={`released:${it.id}`} defaultChecked={it.released} className="size-4 accent-[var(--accent)]" />
                            Released<span className="sr-only"> for {it.title}</span>
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {weighted && <p className="text-xs text-muted">This course uses weighted categories, so every item needs a category.</p>}
            </ActionForm>
          </div>
        )}
      </Card>
    </>
  );
}
