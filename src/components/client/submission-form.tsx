"use client";

import { FileUp } from "lucide-react";
import { useState } from "react";
import { submitAssignment } from "@/app/actions/student";
import { ActionForm } from "@/components/action-form";
import { Field, Textarea } from "@/components/ui";

export function SubmissionForm({ assignmentId, defaultText, hasFile, accept, resubmit }: { assignmentId: string; defaultText: string; hasFile: boolean; accept: string; resubmit: boolean }) {
  const [fileName, setFileName] = useState<string>();
  return (
    <ActionForm action={submitAssignment} submitLabel={resubmit ? "Update submission" : "Submit assignment"}>
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <Field label="Online text" hint="Optional if you attach a file. Supports Markdown.">
        <Textarea name="text" defaultValue={defaultText} rows={6} maxLength={50000} />
      </Field>
      <label className="relative grid cursor-pointer place-items-center gap-1 rounded-2xl border-2 border-dashed border-border px-4 py-6 text-center text-sm transition hover:border-accent/60">
        <FileUp className="size-6 text-accent" />
        <span className="font-medium">{fileName ?? (hasFile ? "Replace attached file (optional)" : "Attach a file (optional)")}</span>
        <span className="text-xs text-muted">PDF, images, Office documents, TXT, CSV · up to 8 MB</span>
        <input type="file" name="file" accept={accept} onChange={(e) => setFileName(e.target.files?.[0]?.name)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      <p className="text-xs text-muted">You can update your submission until the deadline (or late window), unless it has been graded.</p>
    </ActionForm>
  );
}
