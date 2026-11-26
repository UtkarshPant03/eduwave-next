"use client";

import { FileUp, Link2, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addResource, enrolStudents, scheduleLive, type EnrolResult } from "@/app/actions/instructor";
import { ActionForm } from "@/components/action-form";
import { Button, Field, FormMessage, Input, Select, Textarea } from "@/components/ui";

type Section = { id: string; title: string };

function SectionSelect({ sections, name = "sectionId" }: { sections: Section[]; name?: string }) {
  return (
    <Field label="Section">
      <Select name={name} defaultValue={sections[0]?.id ?? ""}>
        <option value="">General</option>
        {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
      </Select>
    </Field>
  );
}

/** Add a file (drag & drop, max 8 MB) or a web link to a section. */
export function ResourceForm({ courseId, sections, accept }: { courseId: string; sections: Section[]; accept: string }) {
  const [kind, setKind] = useState<"file" | "link">("file");
  const [fileName, setFileName] = useState<string>();
  const [dragging, setDragging] = useState(false);
  return (
    <ActionForm action={addResource} submitLabel="Add to course">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="kind" value={kind} />
      <div role="radiogroup" aria-label="Material type" className="inline-flex w-fit rounded-xl border border-border bg-surface-2 p-1 text-sm">
        {(["file", "link"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 transition ${kind === k ? "bg-surface font-medium shadow-sm" : "text-muted"}`}
          >
            {k === "file" ? <FileUp className="size-3.5" /> : <Link2 className="size-3.5" />}
            {k === "file" ? "Upload file" : "Web link"}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title"><Input name="title" required maxLength={160} placeholder="Lecture 3 slides" /></Field>
        <SectionSelect sections={sections} />
      </div>
      <Field label="Description (optional)"><Input name="description" maxLength={1000} /></Field>
      {kind === "link" ? (
        <Field label="URL"><Input name="url" type="url" placeholder="https://…" required /></Field>
      ) : (
        <label
          onDragOver={(e) => (e.preventDefault(), setDragging(true))}
          onDragLeave={() => setDragging(false)}
          onDrop={() => setDragging(false)}
          className={`relative grid cursor-pointer place-items-center gap-1 rounded-2xl border-2 border-dashed px-4 py-8 text-center text-sm transition ${dragging ? "border-accent bg-accent/5" : "border-border hover:border-muted"}`}
        >
          <FileUp className="size-6 text-accent" />
          <span className="font-medium">{fileName ?? "Drop a file here or click to browse"}</span>
          <span className="text-xs text-muted">PDF, images, Word, PowerPoint, Excel, TXT, CSV · up to 8 MB</span>
          <input type="file" name="file" required accept={accept} onChange={(e) => setFileName(e.target.files?.[0]?.name)} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
      )}
    </ActionForm>
  );
}

/** Schedule a Jitsi live class. Local time is converted to UTC in the browser. */
export function LiveForm({ courseId, sections }: { courseId: string; sections: Section[] }) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const local = String(fd.get("startsAt") ?? "");
        start(async () => {
          const res = await scheduleLive({
            courseId,
            sectionId: String(fd.get("sectionId") ?? ""),
            title: String(fd.get("title")),
            startsAt: local ? new Date(local).toISOString() : "",
            durationMinutes: Number(fd.get("durationMinutes")),
          });
          if (res?.error) setError(res.error);
          else {
            setError(undefined);
            form.reset();
            toast.success(res?.success ?? "Scheduled.");
          }
        });
      }}
    >
      <Field label="Topic"><Input name="title" required maxLength={160} placeholder="Doubt-clearing session: Unit 2" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Starts at"><Input name="startsAt" type="datetime-local" required /></Field>
        <Field label="Duration (minutes)"><Input name="durationMinutes" type="number" min={10} max={240} defaultValue={60} required /></Field>
      </div>
      <SectionSelect sections={sections} />
      <FormMessage state={{ error }} />
      <div><Button disabled={pending}>{pending ? "Scheduling…" : "Schedule & notify students"}</Button></div>
    </form>
  );
}

/** Enrol students by pasting emails / student IDs. */
export function EnrolPanel({ courseId }: { courseId: string }) {
  const [list, setList] = useState("");
  const [result, setResult] = useState<EnrolResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-3">
      <Textarea value={list} onChange={(e) => setList(e.target.value)} rows={5} placeholder={"22CS1043\n22CS1044\nananya.rao@university.edu"} className="font-mono text-xs" aria-label="Student emails or IDs" />
      <div>
        <Button
          disabled={pending || !list.trim()}
          onClick={() =>
            start(async () => {
              const r = await enrolStudents(courseId, list);
              setResult(r);
              if (r.added.length) toast.success(`Enrolled ${r.added.length} student(s).`);
              setList(r.notFound.join("\n"));
            })
          }
        >
          <UserPlus className="size-4" /> {pending ? "Enrolling…" : "Enrol students"}
        </Button>
      </div>
      {result && (
        <div className="space-y-1 text-xs">
          {result.added.length > 0 && <p className="text-success">Added: {result.added.join(", ")}</p>}
          {result.already.length > 0 && <p className="text-muted">Already enrolled: {result.already.join(", ")}</p>}
          {result.notFound.length > 0 && <p className="text-danger">No student account found for: {result.notFound.join(", ")} (left in the box above).</p>}
        </div>
      )}
    </div>
  );
}
