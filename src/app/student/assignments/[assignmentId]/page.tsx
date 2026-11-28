import { AlarmClock, Award, CheckCircle2, FileText, Files, MessageSquareQuote } from "lucide-react";
import { SubmissionForm } from "@/components/client/submission-form";
import { FileLinks, VersionHistory } from "@/components/course/submission-files";
import { Markdown } from "@/components/markdown";
import { Badge, Card, IconChip, PageHeader, ProgressRing } from "@/components/ui";
import { requireStudent } from "@/lib/auth/dal";
import { getAssignmentForStudent } from "@/lib/data/assessments";
import { formatDateTime, formatRelative, requestTime } from "@/lib/format";
import { assignmentWindow } from "@/lib/grading";
import { ACCEPT_ATTR, MAX_REQUEST_UPLOAD_BYTES } from "@/lib/uploads";
import { routeIds } from "@/lib/route-ids";

export default async function StudentAssignmentPage({ params }: PageProps<"/student/assignments/[assignmentId]">) {
  const { assignmentId } = routeIds(await params);
  const user = await requireStudent();
  const { course, assignment, submission, versions, feedbackFiles } = await getAssignmentForStudent(user, assignmentId);
  const latest = versions.at(-1) ?? null;
  const now = requestTime();
  const win = assignmentWindow(assignment, now);
  const graded = submission?.grade != null;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "My courses", href: "/student/courses" }, { label: course.code, href: `/student/courses/${course.id}` }, { label: assignment.title }]}
        eyebrow="Assignment"
        title={assignment.title}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem] [&>*]:min-w-0">
        <div className="space-y-6">
          <Card title="Instructions" icon={<FileText />}>
            <Markdown text={assignment.instructions} className="prose-chat text-sm" />
          </Card>

          {graded && (
            <Card title="Feedback" icon={<MessageSquareQuote />} className="border-success/40">
              <div className="flex flex-wrap items-center gap-5">
                <ProgressRing value={(submission.grade! / assignment.maxPoints) * 100} size={72} label="Score" />
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{submission.grade} / {assignment.maxPoints}</p>
                  <p className="text-xs text-muted">Graded {submission.gradedAt && formatDateTime(submission.gradedAt)}</p>
                </div>
              </div>
              {submission.feedback && <div className="mt-4 rounded-xl bg-surface-2 p-4 text-sm"><Markdown text={submission.feedback} /></div>}
              {feedbackFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-muted">Files from your grader</p>
                  <FileLinks files={feedbackFiles} />
                </div>
              )}
            </Card>
          )}

          <Card title={submission ? "Your submission" : "Submit your work"}>
            {submission && (
              <div className="mb-4 space-y-3 rounded-xl border border-border p-4 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <CheckCircle2 className="size-4 text-success" /> Submitted {formatDateTime(submission.submittedAt)}
                  {submission.submittedAt > assignment.dueAt && <Badge tone="warning">Late</Badge>}
                  {latest && versions.length > 1 && <Badge tone="accent">Version {latest.versionNumber}</Badge>}
                </p>
                {latest?.text && <div className="rounded-lg bg-surface-2/60 p-3"><Markdown text={latest.text} /></div>}
                {latest && <FileLinks files={latest.files} />}
                <VersionHistory versions={versions} dueAt={assignment.dueAt} />
              </div>
            )}
            {graded ? (
              <p className="text-sm text-muted">This submission has been graded and is now final.</p>
            ) : win.open ? (
              <SubmissionForm
                assignmentId={assignment.id}
                defaultText={latest?.text ?? ""}
                currentFiles={(latest?.files ?? []).map((f) => ({ id: f.id, name: f.name, size: f.size }))}
                maxFiles={assignment.maxFiles}
                maxBytes={MAX_REQUEST_UPLOAD_BYTES}
                accept={ACCEPT_ATTR}
                resubmit={Boolean(submission)}
              />
            ) : (
              <p className="text-sm text-muted">Submissions closed on {formatDateTime(win.closesAt)}.</p>
            )}
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-20 xl:h-fit">
          <Card>
            <ul className="space-y-4 text-sm">
              <li className="flex items-center gap-3">
                <IconChip tone={win.late ? "danger" : "accent"}><AlarmClock /></IconChip>
                <span>
                  <span className="block text-xs text-muted">Due</span>
                  {formatDateTime(assignment.dueAt)} <span className="text-muted">({formatRelative(assignment.dueAt, now)})</span>
                </span>
              </li>
              <li className="flex items-center gap-3">
                <IconChip tone="success"><Award /></IconChip>
                <span><span className="block text-xs text-muted">Points</span>{assignment.maxPoints}</span>
              </li>
              <li className="flex items-center gap-3">
                <IconChip tone="neutral"><Files /></IconChip>
                <span><span className="block text-xs text-muted">Files per submission</span>Up to {assignment.maxFiles} · 8 MB in total per upload</span>
              </li>
              {assignment.lateDays > 0 && (
                <li className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
                  Late submissions accepted until {formatDateTime(win.closesAt)} and marked late.
                </li>
              )}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
