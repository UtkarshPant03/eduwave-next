"use client";

import { FileUp } from "lucide-react";
import { useState } from "react";
import { submitAssignment } from "@/app/actions/student";
import { ActionForm } from "@/components/action-form";
import { Field, Textarea } from "@/components/ui";
import { formatBytes } from "@/lib/format";

type CurrentFile = { id: string; name: string; size: number };

/**
 * Submit or resubmit. Each submission creates a new version; files of the latest version
 * can be kept (ticked) and new ones added, up to the assignment's maximum. Files chosen
 * together must fit the request limit, checked here so the browser never sends a request
 * the server would refuse.
 */
export function SubmissionForm({
  assignmentId,
  defaultText,
  currentFiles,
  maxFiles,
  maxBytes,
  accept,
  resubmit,
}: {
  assignmentId: string;
  defaultText: string;
  currentFiles: CurrentFile[];
  maxFiles: number;
  maxBytes: number;
  accept: string;
  resubmit: boolean;
}) {
  // Files the student unticked. Tracked this way (not as "kept") so a new latest version,
  // arriving after a successful submit, starts with all of its files ticked.
  const [dropped, setDropped] = useState<Set<string>>(() => new Set());
  const [chosen, setChosen] = useState<string[]>([]);
  const [problem, setProblem] = useState<string>();
  // A new latest version arrived (successful submit): start over from its files.
  const signature = currentFiles.map((f) => f.id).join(",");
  const [shownFor, setShownFor] = useState(signature);
  if (shownFor !== signature) {
    setShownFor(signature);
    setDropped(new Set());
    setChosen([]);
    setProblem(undefined);
  }
  const keep = new Set(currentFiles.filter((f) => !dropped.has(f.id)).map((f) => f.id));
  const slots = maxFiles - keep.size;
  const limitText = `${maxFiles === 1 ? "1 file" : `Up to ${maxFiles} files`} · ${formatBytes(maxBytes)} in total per upload · PDF, images, Office documents, TXT, CSV`;

  return (
    <ActionForm action={submitAssignment} submitLabel={resubmit ? "Update submission" : "Submit assignment"}>
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <Field label="Online text" hint="Optional if you attach a file. Supports Markdown.">
        <Textarea name="text" defaultValue={defaultText} rows={6} maxLength={50000} />
      </Field>
      {currentFiles.length > 0 && (
        <fieldset className="grid gap-1.5 text-sm">
          <legend className="mb-1 font-medium">Files in your latest version</legend>
          {currentFiles.map((f) => (
            <label key={f.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="keep"
                value={f.id}
                checked={keep.has(f.id)}
                onChange={(e) => {
                  const next = new Set(dropped);
                  if (e.target.checked) next.delete(f.id);
                  else next.add(f.id);
                  setDropped(next);
                }}
                className="size-4 accent-[var(--color-accent)]"
              />
              Keep {f.name} <span className="text-xs text-muted">{formatBytes(f.size)}</span>
            </label>
          ))}
          <span className="text-xs text-muted">Unticked files are left out of the new version. Earlier versions always keep their files.</span>
        </fieldset>
      )}
      <label className="relative grid cursor-pointer place-items-center gap-1 rounded-2xl border-2 border-dashed border-border px-4 py-6 text-center text-sm transition hover:border-accent/60">
        <FileUp className="size-6 text-accent" />
        <span className="font-medium">
          {chosen.length ? chosen.join(", ") : slots <= 0 ? "File limit reached: untick a file to replace it" : maxFiles === 1 ? (currentFiles.length ? "Replace attached file (optional)" : "Attach a file (optional)") : `Attach files (optional, ${slots} more allowed)`}
        </span>
        <span className="text-xs text-muted">{limitText}</span>
        <input
          type="file"
          name="files"
          multiple={maxFiles > 1}
          accept={accept}
          disabled={slots <= 0}
          onChange={(e) => {
            const list = [...(e.target.files ?? [])];
            const total = list.reduce((s, f) => s + f.size, 0);
            const issue =
              list.length > slots
                ? `You can add ${slots} more file${slots === 1 ? "" : "s"} (the limit is ${maxFiles}).`
                : total > maxBytes
                  ? `Files chosen together must be ${formatBytes(maxBytes)} or smaller (these are ${formatBytes(total)}).`
                  : undefined;
            setProblem(issue);
            if (issue) {
              e.target.value = "";
              setChosen([]);
            } else setChosen(list.map((f) => f.name));
          }}
          className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </label>
      {problem && <p role="alert" className="text-sm text-danger">{problem}</p>}
      <p className="text-xs text-muted">
        You can update your submission until the deadline (or late window), unless it has been graded. Each update is saved as a new version; earlier versions stay visible to you and your instructors.
      </p>
    </ActionForm>
  );
}
