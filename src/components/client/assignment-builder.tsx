"use client";

import { Eye, PencilLine } from "lucide-react";
import { useState, useTransition } from "react";
import { createAssignment, updateAssignment } from "@/app/actions/instructor";
import { Markdown } from "@/components/markdown";
import { Button, Card, Field, FormMessage, Input, Select, Textarea } from "@/components/ui";
import { LocalDateTimeInput } from "./local-datetime-input";

export type AssignmentInitial = { id: string; title: string; instructions: string; sectionId: string | null; dueAt: string; maxPoints: number; lateDays: number; maxFiles: number };

/**
 * Assignment editor with a live Markdown preview (same renderer students see).
 * With `initial` it edits an existing assignment instead of creating one.
 */
export function AssignmentBuilder({
  courseId,
  sections,
  initial,
  minPoints = 1,
}: {
  courseId: string;
  sections: { id: string; title: string }[];
  initial?: AssignmentInitial;
  /** The highest grade already awarded: the maximum can't go below it. */
  minPoints?: number;
}) {
  const [error, setError] = useState<string>();
  const [text, setText] = useState(initial?.instructions ?? "");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [pending, start] = useTransition();

  return (
    <form
      className="grid gap-6 lg:grid-cols-[1fr_20rem] [&>*]:min-w-0"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const due = String(fd.get("dueAt") ?? "");
        start(async () => {
          const fields = {
            sectionId: String(fd.get("sectionId") ?? ""),
            title: String(fd.get("title")),
            instructions: text,
            dueAt: due ? new Date(due).toISOString() : "",
            maxPoints: Number(fd.get("maxPoints")),
            lateDays: Number(fd.get("lateDays")),
            maxFiles: Number(fd.get("maxFiles")),
          };
          // On success both actions redirect; a value comes back only on failure.
          const res = initial ? await updateAssignment({ id: initial.id, ...fields }) : await createAssignment({ courseId, ...fields });
          if (res?.error) setError(res.error);
        });
      }}
    >
      <Card title="Assignment">
        <div className="grid gap-3">
          <Field label="Title"><Input name="title" required maxLength={160} defaultValue={initial?.title} placeholder="Lab 3: Implementing a hash table" /></Field>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium">Instructions</span>
              <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs">
                <button type="button" onClick={() => setTab("write")} className={`flex items-center gap-1 rounded-md px-2 py-1 ${tab === "write" ? "bg-surface shadow-sm" : "text-muted"}`}><PencilLine className="size-3" /> Write</button>
                <button type="button" onClick={() => setTab("preview")} className={`flex items-center gap-1 rounded-md px-2 py-1 ${tab === "preview" ? "bg-surface shadow-sm" : "text-muted"}`}><Eye className="size-3" /> Preview</button>
              </div>
            </div>
            {tab === "write" ? (
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} required maxLength={20000} placeholder={"### Objective\nImplement…\n\n### Deliverables\n- Source code (.zip)\n- A short report (PDF)"} className="font-mono text-xs" />
            ) : (
              <div className="min-h-64 rounded-xl border border-border p-4 text-sm">{text.trim() ? <Markdown text={text} /> : <p className="text-muted">Nothing to preview.</p>}</div>
            )}
            <p className="mt-1 text-xs text-muted">Markdown: ### headings, **bold**, *italic*, `code`, lists and [links](https://…).</p>
          </div>
        </div>
      </Card>
      <div className="space-y-6">
        <Card title="Settings">
          <div className="grid gap-3">
            <Field label="Section">
              <Select name="sectionId" defaultValue={initial ? (initial.sectionId ?? "") : (sections[0]?.id ?? "")}>
                <option value="">General</option>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </Select>
            </Field>
            <Field label="Due"><LocalDateTimeInput name="dueAt" iso={initial?.dueAt} required /></Field>
            <Field label="Maximum points"><Input name="maxPoints" type="number" min={minPoints} max={1000} defaultValue={initial?.maxPoints ?? 100} required /></Field>
            <Field label="Late submissions" hint="Accepted (and marked late) for this many days after the due date.">
              <Input name="lateDays" type="number" min={0} max={30} defaultValue={initial?.lateDays ?? 2} required />
            </Field>
            <Field label="Maximum files per submission" hint="1 to 20. Files sent together must be 8 MB or smaller in total. Lowering this never removes files already submitted.">
              <Input name="maxFiles" type="number" min={1} max={20} defaultValue={initial?.maxFiles ?? 1} required />
            </Field>
          </div>
        </Card>
        <FormMessage state={{ error }} />
        <Button disabled={pending} className="w-full">{initial ? (pending ? "Saving…" : "Save changes") : pending ? "Publishing…" : "Publish & notify students"}</Button>
      </div>
    </form>
  );
}
