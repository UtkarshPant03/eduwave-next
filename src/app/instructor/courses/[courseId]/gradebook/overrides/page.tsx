import type { Metadata } from "next";
import { History, PenLine, Sigma } from "lucide-react";
import { removeOverride, setCourseOverride, setItemOverride } from "@/app/actions/gradebook";
import { ActionForm } from "@/components/action-form";
import { Card, Empty, Field, Input, PageHeader, Select, Table, Textarea } from "@/components/ui";
import { courseForInstructor, courseStaffRole } from "@/lib/access";
import { staffCan } from "@/lib/auth/capabilities";
import { requireInstructor } from "@/lib/auth/dal";
import { activeOverrides, gradebook, overrideHistory } from "@/lib/data/gradebook";
import { formatDateTime } from "@/lib/format";
import { routeIds } from "@/lib/route-ids";

export const metadata: Metadata = { title: "Grade overrides" };

const num = (n: number | null) => (n == null ? "–" : String(n));

/**
 * Overrides (staff with grade.edit; the course total needs course.manage). An override
 * replaces the value the gradebook uses; the student's submission or attempt is unchanged.
 * Every override and removal is kept in an append-only history with its reason.
 */
export default async function GradeOverridesPage({ params }: PageProps<"/instructor/courses/[courseId]/gradebook/overrides">) {
  const { courseId } = routeIds(await params);
  const user = await requireInstructor();
  const course = await courseForInstructor(user, courseId, "grade.edit");
  const role = await courseStaffRole(user.id, course.id);
  const canManage = user.role === "admin" || staffCan(role, "course.manage");
  const [book, active, history] = await Promise.all([gradebook(course.id, { audience: "staff" }), activeOverrides(course.id), overrideHistory(course.id)]);
  const students = book.rows.map((r) => r.student);
  const target = (o: { assignmentId: string | null; quizId: string | null; itemTitle?: string | null; quizTitle?: string | null; assignmentTitle?: string | null }) =>
    o.assignmentId ? (o.itemTitle ?? o.assignmentTitle ?? "Assignment") : o.quizId ? (o.quizTitle ?? "Quiz") : "Course total";

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "My courses", href: "/instructor/courses" },
          { label: course.code, href: `/instructor/courses/${course.id}#gradebook` },
          { label: "Overrides" },
        ]}
        title="Grade overrides"
        subtitle="Set the value that counts for one student, with a reason. The student's own work and its calculated score are kept; overridden values are marked in the gradebook and the export."
      />
      <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        <Card title="Override an item" icon={<PenLine />} description="Replaces the points one assignment or quiz counts with for this student.">
          {students.length === 0 || book.items.length === 0 ? (
            <Empty>{students.length === 0 ? "No students enrolled yet." : "No assignments or quizzes yet."}</Empty>
          ) : (
            <ActionForm action={setItemOverride} submitLabel="Save override">
              <input type="hidden" name="courseId" value={course.id} />
              <Field label="Student">
                <Select name="studentId" required defaultValue="">
                  <option value="" disabled>Choose a student</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.studentId})</option>)}
                </Select>
              </Field>
              <Field label="Item">
                <Select name="item" required defaultValue="">
                  <option value="" disabled>Choose an assignment or quiz</option>
                  {book.items.map((i) => <option key={i.id} value={`${i.kind}:${i.id}`}>{i.title} (out of {i.possible})</option>)}
                </Select>
              </Field>
              <Field label="Points that count" hint="Between 0 and the item's maximum.">
                <Input name="points" type="number" min={0} step="0.01" required />
              </Field>
              <Field label="Reason" hint="Required. Kept in the history; not shown to the student.">
                <Textarea name="reason" required minLength={3} maxLength={1000} rows={2} />
              </Field>
            </ActionForm>
          )}
        </Card>
        {canManage && (
          <Card title="Override a course total" icon={<Sigma />} description="Sets this student's course percentage, letter, or both. A percentage gives the letter from the course's scale unless you also choose one.">
            {students.length === 0 ? (
              <Empty>No students enrolled yet.</Empty>
            ) : (
              <ActionForm action={setCourseOverride} submitLabel="Save course override">
                <input type="hidden" name="courseId" value={course.id} />
                <Field label="Student">
                  <Select name="studentId" required defaultValue="">
                    <option value="" disabled>Choose a student</option>
                    {students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.studentId})</option>)}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Percentage (optional)"><Input name="percent" type="number" min={0} max={100} step="0.01" /></Field>
                  <Field label="Letter (optional)">
                    <Select name="letter" defaultValue="">
                      <option value="">From the percentage</option>
                      {book.scale.map((b) => <option key={b.letter} value={b.letter}>{b.letter}{b.label ? ` (${b.label})` : ""}</option>)}
                    </Select>
                  </Field>
                </div>
                <Field label="Reason" hint="Required. Kept in the history; not shown to the student.">
                  <Textarea name="reason" required minLength={3} maxLength={1000} rows={2} />
                </Field>
              </ActionForm>
            )}
          </Card>
        )}
      </div>

      <Card className="mt-6" title="Active overrides" description="Removing one needs a reason too; the calculated value then counts again.">
        {active.length === 0 ? (
          <Empty>No overrides in this course.</Empty>
        ) : (
          <Table head={["Student", "What", "Value", "Reason", "Set by", "Remove"]}>
            {active.map((o) => {
              const isCourse = !o.assignmentId && !o.quizId;
              return (
                <tr key={o.id}>
                  <td className="px-2 py-2">{o.studentName}<span className="block font-mono text-xs text-muted">{o.universityId}</span></td>
                  <td className="px-2 py-2">{target(o)}</td>
                  <td className="px-2 py-2 tabular-nums">{isCourse ? [o.percent != null ? `${o.percent}%` : null, o.letter].filter(Boolean).join(" · ") : num(o.points)}</td>
                  <td className="max-w-64 px-2 py-2 text-muted">{o.reason}</td>
                  <td className="px-2 py-2 text-muted">{o.setBy}<span className="block text-xs">{formatDateTime(o.updatedAt)}</span></td>
                  <td className="px-2 py-2">
                    {isCourse && !canManage ? (
                      <span className="text-xs text-muted">Course managers only</span>
                    ) : (
                      <ActionForm action={removeOverride} submitLabel="Remove override" className="grid min-w-48 gap-2" toastOnSuccess>
                        <input type="hidden" name="overrideId" value={o.id} />
                        <Field label="Reason for removing"><Input name="reason" required minLength={3} maxLength={1000} /></Field>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Card className="mt-6" title="History" icon={<History />} description="Every override and removal, newest first. This history can't be edited or deleted.">
        {history.length === 0 ? (
          <Empty>Nothing yet.</Empty>
        ) : (
          <Table head={["When", "Student", "What", "Change", "Reason", "By"]}>
            {history.map((h) => {
              const isCourse = !h.assignmentId && !h.quizId;
              const before = isCourse ? [h.oldPercent != null ? `${h.oldPercent}%` : null, h.oldLetter].filter(Boolean).join(" ") || "–" : num(h.oldPoints);
              const after = isCourse ? [h.newPercent != null ? `${h.newPercent}%` : null, h.newLetter].filter(Boolean).join(" ") || "removed" : h.newPoints == null ? "removed" : String(h.newPoints);
              return (
                <tr key={h.id}>
                  <td className="whitespace-nowrap px-2 py-2 text-muted">{formatDateTime(h.createdAt)}</td>
                  <td className="px-2 py-2">{h.studentName}<span className="block font-mono text-xs text-muted">{h.universityId}</span></td>
                  <td className="px-2 py-2">{target(h)}</td>
                  <td className="whitespace-nowrap px-2 py-2 tabular-nums">{before} → {after}</td>
                  <td className="max-w-64 px-2 py-2 text-muted">{h.reason}</td>
                  <td className="px-2 py-2 text-muted">{h.changedBy}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
