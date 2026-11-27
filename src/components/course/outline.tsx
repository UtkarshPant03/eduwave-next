import { CheckCircle2, ChevronDown, ClipboardList, ExternalLink, FileText, FolderOpen, Link2, NotebookPen, Video } from "lucide-react";
import Link from "next/link";
import { CompletionToggle } from "@/components/client/completion-toggle";
import { DeleteActivityButton, SectionControls } from "@/components/client/section-controls";
import { Badge, cx, Empty, IconChip } from "@/components/ui";
import type { OutlineItem, OutlineSection } from "@/lib/data/courses";
import { formatBytes, formatDateTime, formatRelative } from "@/lib/format";

const KIND = {
  resource: { icon: FileText, label: "Material", tone: "neutral" as const },
  assignment: { icon: NotebookPen, label: "Assignment", tone: "accent" as const },
  quiz: { icon: ClipboardList, label: "Quiz", tone: "warning" as const },
  live: { icon: Video, label: "Live class", tone: "success" as const },
};

function status(item: OutlineItem, now: number, mode: "student" | "instructor") {
  const t = item.date?.getTime();
  if (item.kind === "live" && t != null) {
    const end = t + 120 * 60_000;
    if (now >= t && now <= end) return <Badge tone="danger">● Live now</Badge>;
    if (now > end) return <Badge>Ended</Badge>;
    return <Badge tone="success">{formatRelative(item.date!, now)}</Badge>;
  }
  if (mode === "student" && item.done) return <Badge tone="success"><CheckCircle2 /> {item.kind === "assignment" ? "Submitted" : "Done"}</Badge>;
  if (t == null) return null;
  if (t < now) return <Badge tone={mode === "student" && item.kind === "assignment" ? "danger" : "neutral"}>{mode === "student" && item.kind === "assignment" ? "Overdue" : "Closed"}</Badge>;
  const soon = t - now < 2 * 86_400_000;
  return <Badge tone={soon ? "warning" : "neutral"}>Due {formatRelative(item.date!, now)}</Badge>;
}

function hrefFor(item: OutlineItem, mode: "student" | "instructor") {
  if (item.kind === "assignment") return `/${mode}/assignments/${item.id}`;
  if (item.kind === "quiz") return `/${mode}/quizzes/${item.id}`;
  return item.href ?? null;
}

export function CourseOutline({
  courseId,
  sections,
  mode,
  now,
  liveLinks,
}: {
  courseId: string;
  sections: OutlineSection[];
  mode: "student" | "instructor";
  now: number;
  /** Jitsi URLs keyed by live-session id (built on the server with the user's name). */
  liveLinks?: Record<string, string>;
}) {
  if (sections.length === 0) {
    return <Empty icon={<FolderOpen />}>{mode === "instructor" ? "Add your first section to start building the course." : "Your instructor hasn't published any content yet."}</Empty>;
  }
  return (
    <div className="stagger min-w-0 space-y-4">
      {sections.map((s, idx) => {
        const done = s.items.filter((i) => i.done).length;
        return (
          <details key={s.id ?? "general"} open={idx < 3} className="group rounded-2xl border border-border bg-surface shadow-card">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
              <span className="grid size-8 place-items-center rounded-lg bg-surface-2 text-xs font-semibold tabular-nums text-muted">{s.id ? idx + (sections[0].id ? 1 : 0) : "·"}</span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">{s.title}</h3>
                {s.summary && <p className="truncate text-sm text-muted">{s.summary}</p>}
              </div>
              {mode === "student" && s.items.length > 0 && (
                <span className="text-xs tabular-nums text-muted">{done}/{s.items.length}</span>
              )}
              {mode === "instructor" && s.id && <SectionControls courseId={courseId} sectionId={s.id} title={s.title} summary={s.summary ?? ""} />}
              <ChevronDown className="size-4 text-muted transition group-open:rotate-180" />
            </summary>
            <ul className="divide-y divide-border border-t border-border">
              {s.items.length === 0 && <li className="px-5 py-4 text-sm text-muted">No activities in this section yet.</li>}
              {s.items.map((item) => {
                const k = KIND[item.kind];
                const href = item.kind === "live" ? liveLinks?.[item.id] ?? null : hrefFor(item, mode);
                const external = item.kind === "resource" || item.kind === "live";
                const body = (
                  <>
                    <IconChip tone={k.tone}><k.icon /></IconChip>
                    <span className="min-w-0 flex-1">
                      <span className={cx("flex items-center gap-1.5 font-medium", href && "group-hover/item:text-accent")}>
                        <span className="truncate">{item.title}</span>
                        {external && href && (item.kind === "resource" && !item.file ? <Link2 className="size-3.5 shrink-0 text-muted" /> : <ExternalLink className="size-3.5 shrink-0 text-muted" />)}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {k.label}
                        {item.file && ` · ${item.file.name} · ${formatBytes(item.file.size)}`}
                        {item.meta && ` · ${item.meta}`}
                        {item.date && ` · ${formatDateTime(item.date)}`}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={item.id} className="group/item flex items-center gap-3 px-5 py-3 text-sm transition hover:bg-surface-2/50">
                    {href ? (
                      <Link href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className="flex min-w-0 flex-1 items-center gap-3">
                        {body}
                      </Link>
                    ) : (
                      <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
                    )}
                    {status(item, now, mode)}
                    {mode === "student" && (item.kind === "resource" || item.kind === "live") && (
                      <CompletionToggle courseId={courseId} itemId={item.id} done={Boolean(item.done)} />
                    )}
                    {mode === "instructor" && <DeleteActivityButton courseId={courseId} kind={item.kind} id={item.id} title={item.title} />}
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
