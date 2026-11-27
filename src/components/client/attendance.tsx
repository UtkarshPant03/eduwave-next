"use client";

import { Check, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createAttendanceSession, decideCorrection, requestCorrection, saveAttendance } from "@/app/actions/attendance";
import { Badge, Button, Field, FormMessage, Input, Select, Textarea } from "@/components/ui";
import { ATTENDANCE_STATUSES, type AttendanceStatus, STATUS_LABEL } from "@/lib/attendance";
import { Dialog } from "./dialog";
import { LocalDateTimeInput } from "./local-datetime-input";

/** Start a class meeting (date/time in the user's zone, sent as ISO). */
export function TakeAttendanceForm({ courseId, sections }: { courseId: string; sections: { id: string; label: string }[] }) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const when = String(fd.get("heldAt") ?? "");
        start(async () => {
          const r = await createAttendanceSession({
            courseId,
            heldAt: when ? new Date(when).toISOString() : "",
            topic: String(fd.get("topic") ?? ""),
            sectionId: String(fd.get("sectionId") ?? ""),
          });
          if (r?.error) setError(r.error);
        });
      }}
    >
      <Field label="Class date and time"><LocalDateTimeInput name="heldAt" iso={new Date().toISOString()} required /></Field>
      <Field label="Topic (optional)"><Input name="topic" maxLength={200} placeholder="e.g. Binary search trees" /></Field>
      {sections.length > 0 && (
        <Field label="Class section" hint="Limits the sheet to students placed in that section this term.">
          <Select name="sectionId" defaultValue="">
            <option value="">All enrolled students</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Field>
      )}
      <FormMessage state={{ error }} />
      <div><Button disabled={pending}>{pending ? "Opening…" : "Take attendance"}</Button></div>
    </form>
  );
}

type Row = { id: string; name: string; studentId: string | null; status: AttendanceStatus | null };

/** The attendance sheet: one radio group per student; unmarked students default to present. */
export function AttendanceSheet({ sessionId, roster }: { sessionId: string; roster: Row[] }) {
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>(() => Object.fromEntries(roster.map((r) => [r.id, r.status ?? "present"])));
  const [pending, start] = useTransition();
  const changed = roster.filter((r) => r.status !== marks[r.id]).length;
  const counts = Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s, Object.values(marks).filter((m) => m === s).length])) as Record<AttendanceStatus, number>;

  if (roster.length === 0) return <p className="text-sm text-muted">No students on this session&apos;s roster.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {ATTENDANCE_STATUSES.map((s) => <Badge key={s} tone={s === "absent" ? "danger" : s === "late" ? "warning" : s === "present" ? "success" : "neutral"}>{STATUS_LABEL[s]}: {counts[s]}</Badge>)}
        <Button type="button" variant="secondary" size="sm" onClick={() => setMarks(Object.fromEntries(roster.map((r) => [r.id, "present"])))}>Mark all present</Button>
      </div>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border-strong text-xs text-muted">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-semibold">Student</th>
              {ATTENDANCE_STATUSES.map((s) => <th key={s} scope="col" className="px-2 py-2.5 text-center font-semibold">{STATUS_LABEL[s]}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {roster.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">{r.name}<span className="block text-xs text-muted">{r.studentId}</span></td>
                {ATTENDANCE_STATUSES.map((s) => (
                  <td key={s} className="px-2 py-2 text-center">
                    <input
                      type="radio"
                      name={`mark-${r.id}`}
                      checked={marks[r.id] === s}
                      onChange={() => setMarks((m) => ({ ...m, [r.id]: s }))}
                      aria-label={`${STATUS_LABEL[s]} for ${r.name}`}
                      className="size-5 accent-[var(--accent)]"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 py-3">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveAttendance({ sessionId, entries: roster.map((s) => ({ studentId: s.id, status: marks[s.id] })) });
              if (r.error) toast.error(r.error);
              else toast.success(`Attendance saved for ${r.saved} student(s).`);
            })
          }
        >
          {pending ? "Saving…" : "Save attendance"}
        </Button>
        <span className="text-sm text-muted">{changed ? `${changed} change(s) not saved yet` : "All marks saved"}</span>
      </div>
    </div>
  );
}

export function CorrectionDecision({ id, student }: { id: string; student: string }) {
  const [pending, start] = useTransition();
  const decide = (approve: boolean) =>
    start(async () => {
      const r = await decideCorrection(id, approve);
      if (r.error) toast.error(r.error);
      else toast.success(approve ? "Correction approved." : "Request declined.");
    });
  return (
    <span className="flex gap-1">
      <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => decide(true)} aria-label={`Approve correction for ${student}`}><Check className="size-3.5" /> Approve</Button>
      <Button type="button" size="sm" variant="danger" disabled={pending} onClick={() => decide(false)} aria-label={`Decline correction for ${student}`}><X className="size-3.5" /> Decline</Button>
    </span>
  );
}

/**
 * On success the server refreshes the page and this row swaps the button for "Correction …
 * requested", unmounting the dialog. So the confirmation toast is raised from the submit
 * callback rather than from form state (an effect in an unmounted form would never run).
 */
export function RequestCorrectionButton({ sessionId, current, label }: { sessionId: string; current: AttendanceStatus; label: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)} aria-label={`Request correction for ${label}`}>Request correction</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Request a correction">
        <p className="mb-3 text-sm text-muted">Recorded as <strong>{STATUS_LABEL[current]}</strong> for {label}. Your instructor will review the request.</p>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const r = await requestCorrection(undefined, fd);
              if (r?.error) setError(r.error);
              else if (r?.success) {
                toast.success(r.success);
                setOpen(false);
              }
            });
          }}
        >
          <input type="hidden" name="sessionId" value={sessionId} />
          <Field label="Should be">
            <Select name="requestedStatus" defaultValue={current === "present" ? "late" : "present"}>
              {ATTENDANCE_STATUSES.filter((s) => s !== current).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </Select>
          </Field>
          <Field label="Reason"><Textarea name="reason" rows={3} required minLength={5} maxLength={1000} /></Field>
          <FormMessage state={{ error }} />
          <div><Button disabled={pending}>{pending ? "Sending…" : "Send request"}</Button></div>
        </form>
      </Dialog>
    </>
  );
}
