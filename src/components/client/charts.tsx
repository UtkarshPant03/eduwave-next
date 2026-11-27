"use client";

/**
 * Charts (Recharts, MIT). Conventions from the dataviz guidelines:
 * - one y-axis per chart; recessive grid; thin marks with 4px rounded data-ends
 * - a single series has no legend (the card title names it); 2 series get a legend
 *   AND a direct label, plus a dashed line so identity is never colour alone
 * - colours come from validated CSS tokens (--series-1/2), with dark-mode steps
 * - every chart has a hover tooltip, and the same numbers are available as a table
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const axis = { stroke: "var(--muted)", fontSize: 12, tickLine: false, axisLine: false } as const;

function TooltipBox({ active, payload, label, unit = "" }: { active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-md">
      {label && <p className="mb-1 font-medium text-foreground">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-muted">
          <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {p.name}: <span className="font-medium tabular-nums text-foreground">{Math.round(p.value)}{unit}</span>
        </p>
      ))}
    </div>
  );
}

/** Histogram of student scores (single series). */
export function ScoreDistribution({ buckets }: { buckets: { range: string; students: number }[] }) {
  return (
    <div className="h-56" role="img" aria-label={`Score distribution: ${buckets.map((b) => `${b.range}: ${b.students}`).join(", ")}`}>
      <ResponsiveContainer>
        <BarChart data={buckets} margin={{ top: 16, right: 8, bottom: 0, left: -20 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="range" {...axis} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<TooltipBox />} />
          <Bar dataKey="students" name="Students" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={56}>
            <LabelList dataKey="students" position="top" fill="var(--muted)" fontSize={11} formatter={(v) => (Number(v) > 0 ? String(v) : "")} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Average % per subject, horizontal bars (single series). */
export function SubjectBars({ data }: { data: { subject: string; averagePercent: number }[] }) {
  return (
    <div style={{ height: Math.max(120, data.length * 44 + 40) }} role="img" aria-label={`Average by subject: ${data.map((d) => `${d.subject} ${Math.round(d.averagePercent)}%`).join(", ")}`}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 0, left: 8 }} barCategoryGap={10}>
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
          <XAxis type="number" domain={[0, 100]} unit="%" {...axis} />
          <YAxis type="category" dataKey="subject" width={96} {...axis} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<TooltipBox unit="%" />} />
          <Bar dataKey="averagePercent" name="Average" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={22}>
            <LabelList dataKey="averagePercent" position="right" fill="var(--muted)" fontSize={11} formatter={(v) => `${Math.round(Number(v))}%`} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
