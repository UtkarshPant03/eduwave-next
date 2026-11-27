/**
 * Styled primitives. Deliberately plain Tailwind (no component library) so students
 * can read every class. Server-safe: no hooks here (see components/client/* for those).
 */
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "danger" | "ghost";

export const buttonClass = (variant: Variant = "primary", size: "sm" | "md" = "md") =>
  cx(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors whitespace-nowrap",
    "disabled:opacity-60 disabled:cursor-not-allowed",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    size === "md" ? "min-h-9 px-3.5 py-2 text-sm" : "min-h-8 px-2.5 py-1.5 text-xs",
    variant === "primary" && "bg-brand text-white hover:opacity-90",
    variant === "secondary" && "border border-border-strong bg-surface hover:bg-surface-2",
    variant === "danger" && "border border-border-strong bg-surface text-danger hover:bg-danger/10",
    variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-foreground",
  );

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" }) {
  return <button className={cx(buttonClass(variant, size), className)} {...props} />;
}

const fieldClass =
  "w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm placeholder:text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(fieldClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(fieldClass, "min-h-24", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(fieldClass, className)} {...props} />;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Card({
  title,
  action,
  children,
  className,
  description,
  icon,
}: {
  title?: ReactNode;
  action?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-xl border border-border bg-surface p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            {icon && <span aria-hidden className="mt-0.5 text-muted [&>svg]:size-4">{icon}</span>}
            <div>
              {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Small tinted square holding an icon. */
export function IconChip({ children, tone = "accent", size = "md" }: { children: ReactNode; tone?: "accent" | "brand" | "success" | "warning" | "danger" | "neutral"; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      aria-hidden
      className={cx(
        "grid shrink-0 place-items-center rounded-lg",
        size === "sm" && "size-7 [&>svg]:size-3.5",
        size === "md" && "size-9 [&>svg]:size-4",
        size === "lg" && "size-11 [&>svg]:size-5",
        tone === "accent" && "bg-accent/10 text-accent",
        tone === "brand" && "bg-brand text-white",
        tone === "success" && "bg-success/10 text-success",
        tone === "warning" && "bg-warning/10 text-warning",
        tone === "danger" && "bg-danger/10 text-danger",
        tone === "neutral" && "bg-surface-2 text-muted",
      )}
    >
      {children}
    </span>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3 opacity-60" aria-hidden />}
          {it.href ? (
            <Link href={it.href} className="hover:text-foreground">{it.label}</Link>
          ) : (
            <span aria-current="page" className="text-foreground">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  eyebrow,
  breadcrumbs,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  eyebrow?: ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}) {
  return (
    <div className="mb-6">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-sm text-muted">{eyebrow}</p>}
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {action && <div className="flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

export function Empty({ children, icon, action }: { children: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong px-4 py-8 text-center text-sm text-muted">
      {icon && <IconChip size="lg" tone="neutral">{icon}</IconChip>}
      <div>{children}</div>
      {action}
    </div>
  );
}

export function FormMessage({ state }: { state?: { error?: string; success?: string } }) {
  if (!state?.error && !state?.success) return null;
  return (
    <p role="status" aria-live="polite" className={cx("text-sm", state.error ? "text-danger" : "text-success")}>
      {state.error ?? state.success}
    </p>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "accent" | "success" | "danger" | "warning";
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium [&>svg]:size-3",
        tone === "neutral" && "border-border bg-surface-2 text-muted",
        tone === "accent" && "border-accent/30 bg-accent/10 text-accent",
        tone === "success" && "border-success/30 bg-success/10 text-success",
        tone === "danger" && "border-danger/30 bg-danger/10 text-danger",
        tone === "warning" && "border-warning/30 bg-warning/10 text-warning",
      )}
    >
      {children}
    </span>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border-strong text-xs text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border [&>tr:hover]:bg-surface-2/60 [&_td]:px-3">{children}</tbody>
      </table>
    </div>
  );
}

/** Headline number with an icon. Not a chart: one value doesn't need axes. */
export function StatTile({ label, value, hint, icon, tone = "accent" }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "accent" | "success" | "warning" | "danger" | "neutral" }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4" data-tone={tone}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{label}</p>
        {icon && <span aria-hidden className="text-muted [&>svg]:size-4">{icon}</span>}
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Thin completion bar with a text value beside it (the bar is never the only signal). */
export function Progress({ value, label, showValue = true }: { value: number; label: string; showValue?: boolean }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      {showValue && <span className="w-9 text-right text-xs tabular-nums text-muted">{Math.round(pct)}%</span>}
    </div>
  );
}

/** Circular progress with the value in the middle. */
export function ProgressRing({ value, size = 56, label }: { value: number; size?: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = 15.5;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${Math.round(pct)}%`}>
      <svg viewBox="0 0 36 36" className="size-full -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="3.5" />
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[11px] font-semibold tabular-nums">{Math.round(pct)}%</span>
    </div>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  // Neutral initials: identity comes from the name next to it, not from colour.
  return (
    <span
      aria-hidden
      className={cx(
        "grid shrink-0 place-items-center rounded-full border border-border-strong bg-surface-2 font-semibold text-foreground",
        size === "sm" && "size-7 text-[11px]",
        size === "md" && "size-9 text-xs",
        size === "lg" && "size-14 text-lg",
      )}
    >
      {initials}
    </span>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-4 w-32 rounded" />
      <div className="skeleton h-8 w-72 rounded-lg" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="skeleton h-64 rounded-xl lg:col-span-2" />
        <div className="skeleton h-64 rounded-xl" />
      </div>
    </div>
  );
}
