import { ClipboardList, NotebookPen } from "lucide-react";
import { Avatar, Badge, Empty, cx } from "@/components/ui";
import type { gradebook } from "@/lib/data/gradebook";
import { formatPercent } from "@/lib/format";

type Book = Awaited<ReturnType<typeof gradebook>>;

/** Students × items matrix. Sticky first column so names stay visible while scrolling. */
export function GradebookTable({ book }: { book: Book }) {
  if (book.rows.length === 0) return <Empty>No students enrolled yet.</Empty>;
  if (book.items.length === 0) return <Empty>No graded activities yet. Create an assignment or quiz.</Empty>;
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
          <tr>
            <th className="sticky left-0 z-10 bg-surface-2 px-3 py-2.5 font-medium">Student</th>
            {book.items.map((it) => (
              <th key={it.id} className="min-w-28 px-3 py-2.5 font-medium" title={it.title}>
                <span className="flex items-center gap-1 normal-case tracking-normal">
                  {it.kind === "assignment" ? <NotebookPen className="size-3" /> : <ClipboardList className="size-3" />}
                  <span className="max-w-32 truncate">{it.title}</span>
                </span>
                <span className="font-normal normal-case tracking-normal">/{it.possible}</span>
              </th>
            ))}
            <th className="px-3 py-2.5 font-medium">Total</th>
            <th className="px-3 py-2.5 font-medium">Grade</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {book.rows.map((r) => (
            <tr key={r.student.id} className="hover:bg-surface-2/50">
              <td className="sticky left-0 z-10 bg-surface px-3 py-2">
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <Avatar name={r.student.name} size="sm" />
                  <span>
                    {r.student.name}
                    <span className="block font-mono text-[11px] text-muted">{r.student.studentId}</span>
                  </span>
                </span>
              </td>
              {book.items.map((it) => {
                const c = r.cells[it.id];
                return (
                  <td key={it.id} className="px-3 py-2 tabular-nums">
                    {c.status === "graded" && c.earned}
                    {c.status === "submitted" && <Badge tone="accent">To grade</Badge>}
                    {c.status === "missing" && <span className="text-danger">0 <span className="text-[10px]">missing</span></span>}
                    {c.status === "upcoming" && <span className="text-muted">–</span>}
                  </td>
                );
              })}
              <td className="px-3 py-2 tabular-nums">
                {r.total.possible ? `${r.total.earned}/${r.total.possible}` : "–"}
                <span className="block text-[11px] text-muted">{formatPercent(r.total.percent)}</span>
              </td>
              <td className="px-3 py-2">
                {r.total.letter ? (
                  <span className={cx("inline-grid min-w-9 place-items-center rounded-lg px-2 py-1 text-xs font-semibold", r.total.letter.letter === "F" ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent")}>
                    {r.total.letter.letter}
                  </span>
                ) : (
                  "–"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
