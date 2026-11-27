import Link from "next/link";
import { CheckCircle2, ChevronDown, Clock, FileText, Inbox, Paperclip, Pencil, Users } from "lucide-react";
import { gradeSubmission } from "@/app/actions/instructor";
import { ActionForm } from "@/components/action-form";
import { Markdown } from "@/components/markdown";
import { Avatar, Badge, buttonClass, Card, Field, Input, PageHeader, StatTile, Textarea } from "@/components/ui";
import { requireInstructor } from "@/lib/auth/dal";
import { getAssignmentForInstructor } from "@/lib/data/assessments";
import { formatDateTime, formatPercent } from "@/lib/format";
import { routeIds } from "@/lib/route-ids";

export default async function GradeAssignmentPage({ params }: PageProps<"/instructor/assignments/[assignmentId]">) {
  const { assignmentId } = routeIds(await params);
  const user = await requireInstructor();
  const { course, assignment, rows } = await getAssignmentForInstructor(user, assignmentId);
  const submitted = rows.filter((r) => r.submissionId);
  const graded = submitted.filter((r) => r.grade != null);
  // Open only the first ungraded submission: the instructor lands where grading should continue.
  const nextToGrade = rows.find((r) => r.submissionId && r.grade == null)?.studentId;
  const avg = graded.length ? (graded.reduce((s, r) => s + (r.grade ?? 0), 0) / graded.length / assignment.maxPoints) * 100 : null;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "My courses", href: "/instructor/courses" }, { label: course.code, href: `/instructor/courses/${course.id}` }, { label: assignment.title }]}
        eyebrow="Assignment"
        title={assignment.title}
        subtitle={`Due ${formatDateTime(assignment.dueAt)} · ${assignment.maxPoints} points · late window ${assignment.lateDays} day(s)`}
        action={<Link href={`/instructor/assignments/${assignment.id}/edit`} className={buttonClass("secondary")}><Pencil className="size-4" /> Edit</Link>}
      />

      <div className="stagger mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Submitted" value={`${submitted.length} / ${rows.length}`} icon={<Users />} />
        <StatTile label="To grade" value={submitted.length - graded.length} icon={<Inbox />} tone={submitted.length - graded.length ? "warning" : "neutral"} />
        <StatTile label="Graded" value={graded.length} icon={<CheckCircle2 />} tone="success" />
        <StatTile label="Average" value={formatPercent(avg)} icon={<Clock />} tone="neutral" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_24rem] [&>*]:min-w-0">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted">Submissions</h2>
          {rows.map((r) => {
            const late = r.submittedAt && r.submittedAt > assignment.dueAt;
            return (
              <details key={r.studentId} className="group rounded-2xl border border-border bg-surface shadow-card" open={r.studentId === nextToGrade}>
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <Avatar name={r.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{r.name}</span>
                    <span className="block text-xs text-muted">{r.universityId}{r.submittedAt && ` · submitted ${formatDateTime(r.submittedAt)}`}</span>
                  </span>
                  {late && <Badge tone="warning">Late</Badge>}
                  {!r.submissionId ? <Badge tone="danger">Not submitted</Badge> : r.grade != null ? <Badge tone="success">{r.grade}/{assignment.maxPoints}</Badge> : <Badge tone="accent">To grade</Badge>}
                  <ChevronDown className="size-4 text-muted transition group-open:rotate-180" />
                </summary>
                {r.submissionId && (
                  <div className="grid gap-5 border-t border-border p-4 lg:grid-cols-[1fr_16rem] [&>*]:min-w-0">
                    <div className="space-y-3 text-sm">
                      {r.text ? <div className="rounded-xl bg-surface-2/60 p-4"><Markdown text={r.text} /></div> : <p className="text-muted">No text submitted.</p>}
                      {r.fileId && (
                        <a href={`/files/${r.fileId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 hover:border-accent">
                          <Paperclip className="size-4 text-accent" /> {r.fileName}
                        </a>
                      )}
                    </div>
                    <ActionForm action={gradeSubmission} submitLabel={r.grade != null ? "Update grade" : "Save grade"}>
                      <input type="hidden" name="submissionId" value={r.submissionId} />
                      {r.submittedAt && <input type="hidden" name="version" value={r.submittedAt.toISOString()} />}
                      <Field label={`Points (out of ${assignment.maxPoints})`}>
                        <Input name="grade" type="number" min={0} max={assignment.maxPoints} defaultValue={r.grade ?? ""} required />
                      </Field>
                      <Field label="Feedback"><Textarea name="feedback" defaultValue={r.feedback ?? ""} rows={4} maxLength={5000} /></Field>
                    </ActionForm>
                  </div>
                )}
              </details>
            );
          })}
        </section>
        <Card title="Instructions" icon={<FileText />} className="h-fit xl:sticky xl:top-20">
          <Markdown text={assignment.instructions} className="prose-chat text-sm" />
        </Card>
      </div>
    </>
  );
}
