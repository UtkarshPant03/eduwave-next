"use client";

import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteActivity, deleteSection, moveSection, updateSection } from "@/app/actions/instructor";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { Dialog } from "./dialog";

const iconBtn = "grid size-7 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground [&>svg]:size-3.5";

/** Edit / reorder / delete controls shown beside a section header (outside its <summary>). */
export function SectionControls({ courseId, sectionId, title, summary }: { courseId: string; sectionId: string; title: string; summary: string }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  return (
    <span className="flex items-center gap-0.5">
      <button className={iconBtn} aria-label="Move section up" disabled={pending} onClick={() => start(() => moveSection(courseId, sectionId, -1))}><ArrowUp /></button>
      <button className={iconBtn} aria-label="Move section down" disabled={pending} onClick={() => start(() => moveSection(courseId, sectionId, 1))}><ArrowDown /></button>
      <button className={iconBtn} aria-label="Edit section" onClick={() => setEditing(true)}><Pencil /></button>
      <button
        className={`${iconBtn} hover:!text-danger`}
        aria-label="Delete section"
        disabled={pending}
        onClick={() => {
          if (confirm(`Delete "${title}"? Its activities move to "General"; nothing is lost.`)) start(() => deleteSection(courseId, sectionId));
        }}
      >
        <Trash2 />
      </button>
      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit section">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              await updateSection(courseId, sectionId, String(fd.get("title")), String(fd.get("summary")));
              setEditing(false);
              toast.success("Section updated.");
            });
          }}
        >
          <Field label="Title"><Input name="title" defaultValue={title} required maxLength={120} /></Field>
          <Field label="Summary"><Textarea name="summary" defaultValue={summary} maxLength={1000} rows={3} /></Field>
          <div><Button disabled={pending}>Save</Button></div>
        </form>
      </Dialog>
    </span>
  );
}

export function DeleteActivityButton({ courseId, kind, id, title }: { courseId: string; kind: "resource" | "assignment" | "quiz" | "live"; id: string; title: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className={`${iconBtn} hover:!text-danger`}
      aria-label={`Delete ${title}`}
      disabled={pending}
      onClick={() => {
        if (confirm(`Delete "${title}"? This can't be undone.`))
          start(async () => {
            // The server refuses if students have already submitted or attempted it.
            const res = await deleteActivity(courseId, kind, id);
            if (res.error) toast.error(res.error, { duration: 8000 });
            else toast.success("Deleted.");
          });
      }}
    >
      <Trash2 />
    </button>
  );
}
