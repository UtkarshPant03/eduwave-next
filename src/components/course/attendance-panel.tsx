import Link from "next/link";
import { CalendarCheck, Download, Settings2 } from "lucide-react";
import { updateAttendanceSettings } from "@/app/actions/attendance";
import { ActionForm } from "@/components/action-form";
import { CorrectionDecision, RequestCorrectionButton, TakeAttendanceForm } from "@/components/client/attendance";
import { Badge, buttonClass, Card, Empty, Field, Input, Table } from "@/components/ui";
import { belowThreshold, STATUS_LABEL } from "@/lib/attendance";
import { courseAttendanceSummary, listAttendanceSessions, pendingCorrections, studentAttendance } from "@/lib/data/attendance";
import { courseSectionLinks } from "@/lib/data/institution";
import { formatDateTime } from "@/lib/format";

const pct = (p: number | null) => (p == null ? "–" : `${Math.round(p)}%`);

/** Instructor / TA view of a course's attendance. */
export async function InstructorAttendancePanel({
  course,
  canManage,
  canApprove,
}: {
  course: { id: string; termId: string | null };
  canManage: boolean;
  canApprove: boolean;
}) {
  const [summary, sessions, corrections, sections] = await Promise.all([
    courseAttendanceSummary(course.id),
    listAttendanceSessions(course.id),
    canApprove ? pendingCorrections(course.id) : Promise.resolve([]),
    courseSectionLinks(course.id, course.termId),
  ]);
  const { thresholdPercent, lateCreditPercent } = summary.settings;
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_22rem] [&>*]:min-w-0">
      <div className="space-y-6">
        <Card
          title="Attendance by student"
          description={`${thresholdPercent == null ? "No minimum attendance configured." : `Minimum: ${thresholdPercent}%.`} Late counts as ${lateCreditPercent}% of present; excused classes don't count.`}
          action={<a href={`/instructor/courses/${course.id}/attendance/export`} className={buttonClass("secondary", "sm")}><Download className="size-3.5" /> Export CSV</a>}
        >
          {summary.rows.length === 0 ? <Empty>No students enrolled yet.</Empty> : (
            <Table head={["Student", "Present", "Late", "Absent", "Excused", "Attendance"]}>
              {summary.rows.map((r) => (
                <tr key={r.studentId}>
                  <td className="py-2">{r.name}<span className="block text-xs text-muted">{r.universityId}</span></td>
                  <td className="py-2 tabular-nums">{r.present}</td>
                  <td className="py-2 tabular-nums">{r.late}</td>
                  <td className="py-2 tabular-nums">{r.absent}</td>
                  <td className="py-2 tabular-nums">{r.excused}</td>
                  <td className="py-2 tabular-nums">
                    {pct(r.percent)} {belowThreshold(r.percent, thresholdPercent) && <Badge tone="danger">Below minimum</Badge>}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="Classes" icon={<CalendarCheck />}>
          {sessions.length === 0 ? <Empty>No attendance taken yet.</Empty> : (
            <Table head={["Class", "Section", "Present", "Late", "Absent", "Excused"]}>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="py-2">
                    <Link href={`/instructor/courses/${course.id}/attendance/${s.id}`} className="font-medium hover:underline">{formatDateTime(s.heldAt)}</Link>
                    {s.topic && <span className="block text-xs text-muted">{s.topic}</span>}
                  </td>
                  <td className="py-2 text-muted">{s.section ?? "All"}</td>
                  <td className="py-2 tabular-nums">{s.present}</td>
                  <td className="py-2 tabular-nums">{s.late}</td>
                  <td className="py-2 tabular-nums">{s.absent}</td>
                  <td className="py-2 tabular-nums">{s.excused}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
      <div className="space-y-6">
        <Card title="Take attendance"><TakeAttendanceForm courseId={course.id} sections={sections.map((s) => ({ id: s.sectionId, label: s.label }))} /></Card>
        {canApprove && (
          <Card title="Correction requests" description="Approving changes the mark; every change is kept in the attendance history.">
            {corrections.length === 0 ? <p className="text-sm text-muted">No open requests.</p> : (
              <ul className="space-y-4 text-sm">
                {corrections.map((c) => (
                  <li key={c.id} className="space-y-1.5">
                    <p className="font-medium">{c.student} <span className="font-normal text-muted">{c.universityId}</span></p>
                    <p className="text-muted">{formatDateTime(c.heldAt)}{c.topic ? ` · ${c.topic}` : ""}: {c.currentStatus ? STATUS_LABEL[c.currentStatus] : "–"} → <strong className="text-foreground">{STATUS_LABEL[c.requestedStatus]}</strong></p>
                    <p className="rounded-lg bg-surface-2 p-2">{c.reason}</p>
                    <CorrectionDecision id={c.id} student={c.student} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {canManage && (
          <Card title="Attendance settings" icon={<Settings2 />}>
            <ActionForm action={updateAttendanceSettings} submitLabel="Save settings">
              <input type="hidden" name="courseId" value={course.id} />
              <Field label="Minimum attendance (%)" hint="Leave empty if no minimum applies. Students below it are flagged.">
                <Input name="thresholdPercent" type="number" min={0} max={100} defaultValue={thresholdPercent ?? ""} />
              </Field>
              <Field label="A late mark counts as (%) of present" hint="100 = same as present, 0 = same as absent.">
                <Input name="lateCreditPercent" type="number" min={0} max={100} defaultValue={lateCreditPercent} required />
              </Field>
            </ActionForm>
          </Card>
        )}
      </div>
    </div>
  );
}

/** A student's own attendance in a course. */
export async function StudentAttendancePanel({ courseId, studentId }: { courseId: string; studentId: string }) {
  const a = await studentAttendance(courseId, studentId);
  const below = belowThreshold(a.percent, a.settings.thresholdPercent);
  return (
    <Card
      title={`Your attendance: ${pct(a.percent)}`}
      description={
        a.settings.thresholdPercent == null
          ? "No minimum attendance is configured for this course."
          : `Minimum for this course: ${a.settings.thresholdPercent}%.${below ? " You are currently below it." : ""}`
      }
    >
      {a.rows.length === 0 ? <Empty>No attendance recorded yet.</Empty> : (
        <Table head={["Class", "Status", ""]}>
          {a.rows.map((r) => (
            <tr key={r.sessionId}>
              <td className="py-2">{formatDateTime(r.heldAt)}{r.topic && <span className="block text-xs text-muted">{r.topic}</span>}</td>
              <td className="py-2"><Badge tone={r.status === "absent" ? "danger" : r.status === "late" ? "warning" : r.status === "present" ? "success" : "neutral"}>{STATUS_LABEL[r.status]}</Badge></td>
              <td className="py-2 text-right">
                {r.pending ? <span className="text-xs text-muted">Correction to {STATUS_LABEL[r.pending]} requested</span> : <RequestCorrectionButton sessionId={r.sessionId} current={r.status} label={formatDateTime(r.heldAt)} />}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
