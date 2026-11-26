/**
 * Small set of styled primitives. Deliberately plain Tailwind (no component
 * library) so students can read every class. Swap for shadcn/ui if preferred.
 */
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export const buttonClass = (variant: "primary" | "secondary" | "danger" = "primary") =>
  cx(
    "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition",
    "disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    variant === "primary" && "bg-accent text-accent-foreground hover:opacity-90",
    variant === "secondary" && "border border-border bg-surface hover:bg-background",
    variant === "danger" && "border border-border bg-surface text-danger hover:bg-background",
  );

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" }) {
  return <button className={cx(buttonClass(variant), className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm",
        "placeholder:text-muted focus:outline-2 focus:outline-accent",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Card({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-lg border border-border bg-surface p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted">{children}</p>;
}

export function FormMessage({ state }: { state?: { error?: string; success?: string } }) {
  if (!state?.error && !state?.success) return null;
  return (
    <p role="status" aria-live="polite" className={cx("text-sm", state.error ? "text-danger" : "text-success")}>
      {state.error ?? state.success}
    </p>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "accent" | "success" | "danger"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "border-border text-muted",
        tone === "accent" && "border-accent/40 text-accent",
        tone === "success" && "border-success/40 text-success",
        tone === "danger" && "border-danger/40 text-danger",
      )}
    >
      {children}
    </span>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-2 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-48 rounded bg-border" />
      <div className="h-32 rounded-lg bg-border/60" />
      <div className="h-32 rounded-lg bg-border/60" />
    </div>
  );
}
