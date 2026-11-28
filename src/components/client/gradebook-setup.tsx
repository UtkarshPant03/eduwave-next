"use client";

import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveGradebookSetup, saveGradeScale } from "@/app/actions/gradebook";
import { Button, FormMessage, Input } from "@/components/ui";
import { DEFAULT_GRADE_SCALE, scaleProblem, type GradeBand, type TotalMethod } from "@/lib/grading";

let nextKey = 1;

type CategoryRow = { key: number; id?: string; name: string; weight: string };

/**
 * Total method and categories, saved together (so weights can change at once and still
 * total 100). The server re-checks everything; this form only gives early feedback.
 * Re-mounted by the page (key) after each save, so new categories get their ids.
 */
export function GradeCategoriesForm({
  courseId,
  method: initialMethod,
  categories,
}: {
  courseId: string;
  method: TotalMethod;
  categories: { id: string; name: string; weight: number }[];
}) {
  const [method, setMethod] = useState<TotalMethod>(initialMethod);
  const [rows, setRows] = useState<CategoryRow[]>(() => categories.map((c) => ({ key: nextKey++, id: c.id, name: c.name, weight: String(c.weight) })));
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const total = Math.round(rows.reduce((s, r) => s + (Number(r.weight) || 0), 0) * 100) / 100;
  const update = (key: number, patch: Partial<CategoryRow>) => setRows((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        start(async () => {
          const res = await saveGradebookSetup({ courseId, method, categories: rows.map((r) => ({ id: r.id, name: r.name, weight: r.weight === "" ? 0 : Number(r.weight) })) });
          if (res?.error) setError(res.error);
          else if (res?.success) toast.success(res.success);
        });
      }}
    >
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Course total</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="method" value="points" checked={method === "points"} onChange={() => setMethod("points")} className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>
            Sum of points <span className="text-muted">(default)</span>
            <span className="block text-xs text-muted">Points earned ÷ points possible over every counted item.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="method" value="weighted" checked={method === "weighted"} onChange={() => setMethod("weighted")} className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>
            Weighted categories
            <span className="block text-xs text-muted">
              Each category&apos;s percentage × its weight. Weights must total 100%. Categories with no counted work yet are left out and the
              other weights are re-scaled, so an empty category doesn&apos;t pull the total down. Every assignment and quiz needs a category.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="space-y-2">
        <p className="text-sm font-medium">Categories</p>
        {rows.length === 0 && <p className="text-sm text-muted">No categories yet. Category names and weights are your course&apos;s choice: eduWave doesn&apos;t assume a university scheme.</p>}
        {rows.map((r, i) => (
          <div key={r.key} className="flex flex-wrap items-end gap-2">
            <label className="grid min-w-40 flex-1 gap-1 text-sm">
              <span className="text-xs text-muted">Category {i + 1} name</span>
              <Input value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} required maxLength={60} placeholder="e.g. Internal assessment" />
            </label>
            <label className="grid w-28 gap-1 text-sm">
              <span className="text-xs text-muted">Weight (%)</span>
              <Input type="number" min={0} max={100} step="0.01" value={r.weight} onChange={(e) => update(r.key, { weight: e.target.value })} required />
            </label>
            <Button type="button" variant="ghost" aria-label={`Remove category ${r.name || i + 1}`} onClick={() => setRows((xs) => xs.filter((x) => x.key !== r.key))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={rows.length >= 20} onClick={() => setRows((xs) => [...xs, { key: nextKey++, name: "", weight: "0" }])}>
            <Plus className="size-3.5" /> Add category
          </Button>
          <p className={`text-sm tabular-nums ${method === "weighted" && total !== 100 ? "text-danger" : "text-muted"}`} aria-live="polite">
            Weights total {total}%{method === "weighted" && total !== 100 ? " (must be 100%)" : ""}
          </p>
        </div>
        <p className="text-xs text-muted">Removing a category leaves its items without a category (refused while the course uses weighted categories).</p>
      </div>
      <FormMessage state={{ error }} />
      <Button disabled={pending}>{pending ? "Saving…" : "Save total and categories"}</Button>
    </form>
  );
}

type BandRow = { key: number; letter: string; label: string; min: string; points: string };
const toRows = (scale: readonly GradeBand[]): BandRow[] => scale.map((b) => ({ key: nextKey++, letter: b.letter, label: b.label, min: String(b.min), points: String(b.points) }));

/** The course's grade scale, highest band first. Letters follow the displayed whole-number percentage. */
export function GradeScaleEditor({ courseId, scale }: { courseId: string; scale: GradeBand[] }) {
  const [rows, setRows] = useState<BandRow[]>(() => toRows(scale));
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const update = (key: number, patch: Partial<BandRow>) => setRows((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const bands = () => rows.map((r) => ({ letter: r.letter.trim(), label: r.label.trim(), min: Number(r.min), points: Number(r.points) }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const b = bands();
        const problem = scaleProblem(b);
        if (problem) return setError(problem);
        setError(undefined);
        start(async () => {
          const res = await saveGradeScale({ courseId, bands: b });
          if (res?.error) setError(res.error);
          else if (res?.success) toast.success(res.success);
        });
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col" className="px-1 py-1.5 font-medium">Letter</th>
              <th scope="col" className="px-1 py-1.5 font-medium">Label</th>
              <th scope="col" className="px-1 py-1.5 font-medium">From (%)</th>
              <th scope="col" className="px-1 py-1.5 font-medium">Grade points</th>
              <th scope="col" className="px-1 py-1.5"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key}>
                <td className="px-1 py-1"><Input aria-label={`Letter of band ${i + 1}`} value={r.letter} onChange={(e) => update(r.key, { letter: e.target.value })} required maxLength={8} className="w-20" /></td>
                <td className="px-1 py-1"><Input aria-label={`Label of band ${i + 1}`} value={r.label} onChange={(e) => update(r.key, { label: e.target.value })} maxLength={40} className="min-w-32" /></td>
                <td className="px-1 py-1"><Input aria-label={`From (%) for band ${i + 1}`} type="number" min={0} max={100} step={1} value={r.min} onChange={(e) => update(r.key, { min: e.target.value })} required className="w-24" /></td>
                <td className="px-1 py-1"><Input aria-label={`Grade points for band ${i + 1}`} type="number" min={0} max={100} step="0.01" value={r.points} onChange={(e) => update(r.key, { points: e.target.value })} required className="w-24" /></td>
                <td className="px-1 py-1">
                  <Button type="button" variant="ghost" aria-label={`Remove band ${r.letter || i + 1}`} disabled={rows.length <= 1} onClick={() => setRows((xs) => xs.filter((x) => x.key !== r.key))}>
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={rows.length >= 20} onClick={() => setRows((xs) => [...xs, { key: nextKey++, letter: "", label: "", min: "0", points: "0" }])}>
          <Plus className="size-3.5" /> Add band
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setRows(toRows(DEFAULT_GRADE_SCALE))}>
          <RotateCcw className="size-3.5" /> Use the default 10-point scale
        </Button>
      </div>
      <p className="text-xs text-muted">
        List bands from the highest minimum down; minimums must go down strictly and the last band must start at 0%. The letter follows the percentage shown (rounded to a whole number).
      </p>
      <FormMessage state={{ error }} />
      <Button disabled={pending}>{pending ? "Saving…" : "Save grade scale"}</Button>
    </form>
  );
}
