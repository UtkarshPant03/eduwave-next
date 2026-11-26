// Fixed locale + time zone so server-rendered dates match what users expect.
// Change APP_TIME_ZONE for a different region.
const TIME_ZONE = process.env.APP_TIME_ZONE ?? "Asia/Kolkata";

const dateTime = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE });
const dateOnly = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: TIME_ZONE });
const timeOnly = new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: TIME_ZONE });

export const formatDateTime = (d: Date) => dateTime.format(d);
export const formatDate = (d: Date) => dateOnly.format(d);
export const formatTime = (d: Date) => timeOnly.format(d);

export const formatPercent = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "–" : `${Math.round(n)}%`;

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** "in 3 days", "2 hours ago" relative to `now`. */
export function formatRelative(d: Date, now: number) {
  const diff = d.getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  for (const [unit, ms] of units) if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  return diff >= 0 ? "in under a minute" : "just now";
}

/**
 * Current time for Server Components. Server Components render once per request
 * (they never re-render in the browser), so reading the clock here is stable for
 * that response. Client Components should use state/effects instead.
 */
export const requestTime = () => Date.now();
