import { History, Paperclip } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui";
import type { SubmissionFile, SubmissionVersion } from "@/lib/data/assessments";
import { formatBytes, formatDateTime } from "@/lib/format";

/** Download links for a list of stored files (authorised again by /files/[id]). */
export function FileLinks({ files, extra }: { files: SubmissionFile[]; extra?: (f: SubmissionFile) => React.ReactNode }) {
  if (files.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f.id} className="inline-flex items-center gap-1">
          <a href={`/files/${f.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:border-accent">
            <Paperclip className="size-4 shrink-0 text-accent" /> <span className="truncate">{f.name}</span> <span className="text-xs text-muted">{formatBytes(f.size)}</span>
          </a>
          {extra?.(f)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Every version of a submission, newest first. The latest one is the version that is
 * graded; earlier ones are read-only history. Late = submitted after the due date.
 */
export function VersionHistory({ versions, dueAt }: { versions: SubmissionVersion[]; dueAt: Date }) {
  if (versions.length < 2) return null;
  const latest = versions.at(-1)!.versionNumber;
  return (
    <details className="rounded-xl border border-border text-sm">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 font-medium">
        <History className="size-4 text-accent" /> Submission history ({versions.length} versions)
      </summary>
      <ol className="space-y-3 border-t border-border p-3">
        {[...versions].reverse().map((v) => (
          <li key={v.versionNumber} className="space-y-2 rounded-lg bg-surface-2/50 p-3">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Version {v.versionNumber}</span>
              <span className="text-xs text-muted">{formatDateTime(v.submittedAt)}</span>
              {v.submittedAt > dueAt && <Badge tone="warning">Late</Badge>}
              {v.versionNumber === latest && <Badge tone="accent">Latest</Badge>}
            </p>
            {v.text ? <div className="max-h-48 overflow-auto rounded-md bg-surface p-2 text-xs"><Markdown text={v.text} /></div> : <p className="text-xs text-muted">No text.</p>}
            <FileLinks files={v.files} />
          </li>
        ))}
      </ol>
    </details>
  );
}
