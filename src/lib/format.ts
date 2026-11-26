// Fixed locale + time zone so server-rendered dates match what users expect.
// Change APP_TIME_ZONE for a different region.
const TIME_ZONE = process.env.APP_TIME_ZONE ?? "Asia/Kolkata";

const dateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: TIME_ZONE,
});

export const formatDateTime = (d: Date) => dateTime.format(d);

export const formatPercent = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "–" : `${Math.round(n)}%`;

/**
 * Current time for Server Components. Server Components render once per request
 * (they never re-render in the browser), so reading the clock here is stable for
 * that response. Client Components should use state/effects instead.
 */
export const requestTime = () => Date.now();
