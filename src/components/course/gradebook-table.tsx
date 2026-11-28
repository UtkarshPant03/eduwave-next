import { ClipboardList, EyeOff, NotebookPen } from "lucide-react";
import { Avatar, Badge, Empty, cx } from "@/components/ui";
import type { Gradebook } from "@/lib/data/gradebook";
import { formatPercent } from "@/lib/format";

/** A small visible marker for a value staff set by hand (the text is part of the cell's name). */
function OverrideMark({ title }: { title: string }) {
  return (
    <span className="ml-1 rounded border border-warning/30 bg-warning/10 px-1 text-[10px] font-medium text-warning" title={title}>
      override
    </span>
  );
}

/**
 * Students × items matrix (staff view). Sticky first column so names stay visible while
 * scrolling. Shows each item's category and release state, overrides, per-category
 * percentages when the course has categories, the total (points or weighted) and the
 * letter from the course's own scale.
 */
export function GradebookTable({ book }: { book: Gradebook }) {
  if (book.rows.length === 0) return <Empty>No students enrolled yet.</Empty>;
  if (book.items.length === 0) return <Empty>No graded activities yet. Create an assignment or quiz.</Empty>;
  const categoryName = new Map(book.categories.map((c) => [c.id, c.name]));
  const weighted = book.method === "weighted";
  const lowest = book.scale.at(-1)?.letter;
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-surface-2 px-3 py-2.5 font-medium">Student</th>
            {book.items.map((it) => (
              <th key={it.id} scope="col" className="min-w-28 px-3 py-2.5 font-medium" title={it.title}>
                <span className="flex items-center gap-1 normal-case tracking-normal">
                  {it.kind === "assignment" ? <NotebookPen className="size-3" aria-hidden /> : <ClipboardList className="size-3" aria-hidden />}
                  <span className="max-w-32 truncate">{it.title}</span>
                </span>
                <span className="font-normal normal-case tracking-normal">/{it.possible}</span>
                {(it.categoryId || !it.released) && (
                  <span className="mt-0.5 flex flex-wrap gap-1 font-normal normal-case tracking-normal">
                    {it.categoryId && <span className="text-[10px]">{categoryName.get(it.categoryId)}</span>}
                    {!it.released && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-foreground">
                        <EyeOff className="size-3" aria-hidden /> Not released
                      </span>
                    )}
                  </span>
                )}
              </th>
            ))}
            {book.categories.map((c) => (
              <th key={c.id} scope="col" className="min-w-24 px-3 py-2.5 font-medium">
                <span className="normal-case tracking-normal">{c.name}</span>
                {weighted && <span className="block font-normal normal-case tracking-normal">{c.weight}%</span>}
              </th>
            ))}
            <th scope="col" className="px-3 py-2.5 font-medium">{weighted ? "Weighted total" : "Total"}</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Grade</th>
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
                    {c.overridden ? (
                      <>
                        {c.earned}
                        <OverrideMark title={`Calculated value: ${c.calculated ?? "none"}`} />
                      </>
                    ) : (
                      <>
                        {c.status === "graded" && c.earned}
                        {c.status === "submitted" && <Badge tone="accent">To grade</Badge>}
                        {c.status === "missing" && <span className="text-danger">0 <span className="text-[10px]">missing</span></span>}
                        {c.status === "upcoming" && <span className="text-muted">–</span>}
                      </>
                    )}
                  </td>
                );
              })}
              {r.total.categories.map((c) => (
                <td key={c.id} className="px-3 py-2 tabular-nums text-muted">{c.percent == null ? "–" : formatPercent(c.percent)}</td>
              ))}
              <td className="px-3 py-2 tabular-nums">
                {weighted ? formatPercent(r.total.percent) : r.total.possible ? `${r.total.earned}/${r.total.possible}` : "–"}
                {!weighted && <span className="block text-[11px] text-muted">{formatPercent(r.total.percent)}</span>}
                {r.total.uncategorised > 0 && <span className="block text-[11px] text-danger">{r.total.uncategorised} uncategorised not counted</span>}
              </td>
              <td className="px-3 py-2">
                {r.total.letter ? (
                  <span className={cx("inline-grid min-w-9 place-items-center rounded-lg px-2 py-1 text-xs font-semibold", r.total.letter.letter === lowest ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent")}>
                    {r.total.letter.letter}
                  </span>
                ) : (
                  "–"
                )}
                {r.total.overridden && (
                  <OverrideMark
                    title={`Calculated: ${formatPercent(r.total.calculatedPercent)}${r.total.calculatedLetter ? ` (${r.total.calculatedLetter.letter})` : ""}`}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
