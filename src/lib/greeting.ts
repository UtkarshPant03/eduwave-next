const TZ = process.env.APP_TIME_ZONE ?? "Asia/Kolkata";

/** "Good morning" etc. in the app's time zone. */
export function greeting(now: number) {
  const hour = Number(new Intl.DateTimeFormat("en", { hour: "numeric", hour12: false, timeZone: TZ }).format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}
