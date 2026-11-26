"use client";

import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteActivity, deleteSection, moveSection, updateSection } from "@/app/actions/instructor";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { Dialog } from "./dialog";

const iconBtn = "grid size-7 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground [&>svg]:size-3.5";

/** Edit / reorder / delete controls on a section header (clicks don't toggle the <details>). */
export function SectionControls({ courseId, sectionId, title, summary }: { courseId: string; sectionId: string; title: string; summary: string }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  // Keep clicks on these buttons from toggling the surrounding <details>, but leave
  // clicks inside the (portalled) edit dialog alone so its form can submit.
  const stop = (e: React.MouseEvent) => {
    if ((e.target as Element).closest("dialog")) return;
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <span className="flex items-center gap-0.5" onClick={stop}>
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
        const extra = kind === "assignment" || kind === "quiz" ? " All submissions and grades for it will be deleted." : "";
        if (confirm(`Delete "${title}"?${extra}`))
          start(async () => {
            await deleteActivity(courseId, kind, id);
            toast.success("Deleted.");
          });
      }}
    >
      <Trash2 />
    </button>
  );
}
