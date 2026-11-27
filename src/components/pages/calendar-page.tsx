import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, FileText, Video } from "lucide-react";
import Link from "next/link";
import { buttonClass, Card, cx, PageHeader } from "@/components/ui";
import { requireUser, type Role } from "@/lib/auth/dal";
import { coverFor } from "@/lib/course-colors";
import { calendarEvents, type CalendarEvent } from "@/lib/data/activity";
import { listInstructorCourses } from "@/lib/data/courses";
import { enrolledCourseIds } from "@/lib/data/shared";
import { formatTime, requestTime } from "@/lib/format";

const ICON = { assignment: FileText, quiz: ClipboardList, live: Video };
const TZ = process.env.APP_TIME_ZONE ?? "Asia/Kolkata";

/** YYYY-MM-DD of a date in the app's time zone (so events land on the right day). */
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export async function CalendarPage({ role, searchParams }: { role: Exclude<Role, "admin">; searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const { month } = await searchParams;
  const today = new Date(requestTime());
  const [y, m] = /^\d{4}-\d{2}$/.test(month ?? "") ? month!.split("-").map(Number) : [today.getFullYear(), today.getMonth() + 1];

  const first = new Date(Date.UTC(y, m - 1, 1));
  const gridStart = new Date(first);
  gridStart.setUTCDate(1 - ((first.getUTCDay() + 6) % 7)); // weeks start on Monday
  const days = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i * 86_400_000));

  const courseIds = role === "student" ? await enrolledCourseIds(user.id) : (await listInstructorCourses(user.id)).map((c) => c.id);
  const events = await calendarEvents(courseIds, new Date(gridStart.getTime() - 86_400_000), new Date(gridStart.getTime() + 43 * 86_400_000), role === "student" ? user.id : undefined);
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) byDay.set(dayKey(e.at), [...(byDay.get(dayKey(e.at)) ?? []), e]);

  const monthParam = (dy: number, dm: number) => {
    const d = new Date(Date.UTC(dy, dm - 1, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const label = first.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const todayKey = dayKey(today);
  const hrefFor = (e: CalendarEvent) =>
    e.kind === "assignment" ? `/${role}/assignments/${e.id}` : e.kind === "quiz" ? `/${role}/quizzes/${e.id}` : `/${role}/courses/${e.courseId}`;
  const upcoming = events.filter((e) => e.at.getTime() >= today.getTime()).slice(0, 8);

  return (
    <>
      <PageHeader
        eyebrow="Schedule"
        title="Calendar"
        subtitle="Deadlines and live classes across your courses."
        action={
          <div className="flex items-center gap-2">
            <Link href={`?month=${monthParam(y, m - 1)}`} className={buttonClass("secondary", "sm")} aria-label="Previous month"><ChevronLeft className="size-4" /></Link>
            <Link href={`?month=${monthParam(today.getFullYear(), today.getMonth() + 1)}`} className={buttonClass("secondary", "sm")}>Today</Link>
            <Link href={`?month=${monthParam(y, m + 1)}`} className={buttonClass("secondary", "sm")} aria-label="Next month"><ChevronRight className="size-4" /></Link>
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_18rem] [&>*]:min-w-0">
        <Card title={<span className="flex items-center gap-2"><CalendarDays className="size-4 text-accent" /> {label}</span>}>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border text-xs">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="bg-surface-2 px-2 py-1.5 text-center font-medium text-muted">{d}</div>
            ))}
            {days.map((d) => {
              const key = d.toISOString().slice(0, 10);
              const inMonth = d.getUTCMonth() === m - 1;
              const list = byDay.get(key) ?? [];
              return (
                <div key={key} className={cx("min-h-24 bg-surface p-1.5", !inMonth && "bg-surface-2/50 text-muted")}>
                  <span className={cx("mb-1 grid size-6 place-items-center rounded-full text-[11px] tabular-nums", key === todayKey && "bg-brand font-semibold text-white")}>
                    {d.getUTCDate()}
                  </span>
                  <ul className="space-y-1">
                    {list.slice(0, 3).map((e) => {
                      const Icon = ICON[e.kind];
                      return (
                        <li key={e.id}>
                          <Link
                            href={hrefFor(e)}
                            title={`${e.courseCode}: ${e.title} · ${formatTime(e.at)}`}
                            className={cx(
                              "flex items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] transition hover:brightness-110",
                              // Done items: muted but still readable (fading with opacity failed contrast checks).
                              e.done ? "border-l-[3px] bg-surface-2 text-muted line-through" : "text-white",
                            )}
                            style={e.done ? { borderLeftColor: coverFor(e.color).from } : { background: coverFor(e.color).from }}
                          >
                            <Icon className="size-3 shrink-0" />
                            <span className="truncate">{e.title}</span>
                            {e.done && <span className="sr-only"> (done)</span>}
                          </Link>
                        </li>
                      );
                    })}
                    {list.length > 3 && <li className="px-1 text-[10px] text-muted">+{list.length - 3} more</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="Coming up">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted">Nothing scheduled.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-border pl-4">
              {upcoming.map((e) => {
                const Icon = ICON[e.kind];
                return (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[22px] top-1 size-3 rounded-full ring-4 ring-surface" style={{ background: coverFor(e.color).from }} aria-hidden />
                    <Link href={hrefFor(e)} className="group block text-sm">
                      <span className="flex items-center gap-1.5 font-medium group-hover:text-accent"><Icon className="size-3.5" /> {e.title}</span>
                      <span className="text-xs text-muted">
                        {e.courseCode} · {e.at.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: TZ })} {formatTime(e.at)}
                        {e.done && " · done"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}
