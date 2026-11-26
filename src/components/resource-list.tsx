import { ExternalLink, FileImage, FileSpreadsheet, FileText, Presentation, Trash2 } from "lucide-react";
import { deleteResource } from "@/app/actions/teacher";
import { Badge, Empty } from "./ui";
import { formatBytes, formatDate } from "@/lib/format";
import type { listResources } from "@/lib/data";

type Row = Awaited<ReturnType<typeof listResources>>[number];

function iconFor(r: Row) {
  if (!r.fileId) return ExternalLink;
  if (r.mimeType?.startsWith("image/")) return FileImage;
  if (r.mimeType?.includes("presentation")) return Presentation;
  if (r.mimeType?.includes("sheet") || r.mimeType === "text/csv") return FileSpreadsheet;
  return FileText;
}

export function ResourceList({ resources, manageClassId }: { resources: Row[]; manageClassId?: string }) {
  if (resources.length === 0) return <Empty icon={<FileText />}>No resources shared yet.</Empty>;
  return (
    <ul className="grid gap-2">
      {resources.map((r) => {
        const Icon = iconFor(r);
        const href = r.fileId ? `/files/${r.fileId}` : r.url!;
        return (
          <li key={r.id} className="group flex items-center gap-3 rounded-lg border border-border p-3 transition hover:border-accent">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
              <Icon className="size-5" />
            </span>
            <a href={href} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1">
              <span className="block truncate font-medium group-hover:text-accent">{r.title}</span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <Badge>{r.subject}</Badge>
                {r.fileId ? `${r.fileName} · ${formatBytes(r.fileSize ?? 0)}` : new URL(r.url!).hostname}
                <span>· {formatDate(r.createdAt)}</span>
              </span>
            </a>
            {manageClassId && (
              <form action={deleteResource}>
                <input type="hidden" name="classId" value={manageClassId} />
                <input type="hidden" name="resourceId" value={r.id} />
                <button className="grid size-8 place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger" aria-label={`Delete ${r.title}`}>
                  <Trash2 className="size-4" />
                </button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
