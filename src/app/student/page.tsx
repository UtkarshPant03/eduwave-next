import type { Metadata } from "next";
import { AlarmClock, ArrowRight, BookOpen, CheckCircle2, ClipboardList, Library, Megaphone, NotebookPen, Timer, Video } from "lucide-react";
import Link from "next/link";
import { StudyTimer } from "@/components/client/study-timer";
import { CourseCard } from "@/components/course-cover";
import { TaskList } from "@/components/task-list";
import { Badge, buttonClass, Card, Empty, IconChip, PageHeader, StatTile } from "@/components/ui";
import { requireStudent } from "@/lib/auth/dal";
import { coverFor } from "@/lib/course-colors";
import { calendarEvents } from "@/lib/data/activity";
import { recentAnnouncements } from "@/lib/data/community";
import { listStudentCourses } from "@/lib/data/courses";
import { formatDateTime, formatRelative, requestTime } from "@/lib/format";
import { greeting } from "@/lib/greeting";

export const metadata: Metadata = { title: "Dashboard" };

const KIND_ICON = { assignment: NotebookPen, quiz: ClipboardList, live: Video };

export default async function StudentHome() {
  const user = await requireStudent();
  const courses = await listStudentCourses(user.id);
  const ids = courses.map((c) => c.id);
  const now = requestTime();
  const [events, announcements] = await Promise.all([
    calendarEvents(ids, new Date(now - 2 * 3_600_000), new Date(now + 14 * 86_400_000), user.id),
    recentAnnouncements(ids, 4),
  ]);
  const due = events.filter((e) => e.kind !== "live" && !e.done);
  const nextLive = events.find((e) => e.kind === "live");
  const totalActs = courses.reduce((s, c) => s + c.activities, 0);
  const doneActs = courses.reduce((s, c) => s + c.done, 0);

  return (
    <>
      <PageHeader eyebrow={greeting(now)} title={user.name.split(" ")[0] + " 👋"} subtitle="Here's what's coming up in your courses." />

      <div className="stagger mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Enrolled courses" value={courses.length} icon={<BookOpen />} />
        <StatTile label="Due in 14 days" value={due.length} icon={<AlarmClock />} tone={due.length ? "warning" : "neutral"} hint={due[0] ? `Next: ${due[0].title}` : undefined} />
        <StatTile label="Activities completed" value={`${doneActs}/${totalActs}`} icon={<CheckCircle2 />} tone="success" />
        <StatTile label="Next live class" value={nextLive ? formatRelative(nextLive.at, now) : "–"} hint={nextLive?.title} icon={<Video />} tone="neutral" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">My courses</h2>
              <Link href="/student/catalog" className="flex items-center gap-1 text-sm text-accent hover:underline"><Library className="size-3.5" /> Browse catalogue</Link>
            </div>
            {courses.length === 0 ? (
              <Empty icon={<BookOpen />} action={<Link href="/student/catalog" className={buttonClass()}>Find courses <ArrowRight className="size-4" /></Link>}>
                You&apos;re not enrolled in any courses yet.
              </Empty>
            ) : (
              <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {courses.map((c) => <CourseCard key={c.id} course={c} href={`/student/courses/${c.id}`} />)}
              </div>
            )}
          </section>

          <Card title="Upcoming deadlines" icon={<AlarmClock />} description="Next 14 days, across all courses.">
            {due.length === 0 ? (
              <p className="text-sm text-muted">Nothing due. Enjoy the breathing room!</p>
            ) : (
              <ul className="divide-y divide-border">
                {due.map((e) => {
                  const Icon = KIND_ICON[e.kind];
                  const urgent = e.at.getTime() - now < 2 * 86_400_000;
                  return (
                    <li key={e.id}>
                      <Link href={`/student/${e.kind === "assignment" ? "assignments" : "quizzes"}/${e.id}`} className="group flex items-center gap-3 py-3 text-sm">
                        <span className="h-9 w-1 rounded-full" style={{ background: coverFor(e.color).from }} aria-hidden />
                        <IconChip size="sm" tone={e.kind === "quiz" ? "warning" : "accent"}><Icon /></IconChip>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium group-hover:text-accent">{e.title}</span>
                          <span className="text-xs text-muted">{e.courseCode} · {formatDateTime(e.at)}</span>
                        </span>
                        <Badge tone={urgent ? "danger" : "neutral"}>{formatRelative(e.at, now)}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Announcements" icon={<Megaphone />}>
            {announcements.length === 0 ? (
              <p className="text-sm text-muted">No announcements yet.</p>
            ) : (
              <ul className="space-y-4">
                {announcements.map((a) => (
                  <li key={a.id}>
                    <Link href={`/student/courses/${a.courseId}/discussions/${a.id}`} className="group block text-sm">
                      <span className="flex items-center gap-2 text-xs text-muted">
                        <span className="size-2 rounded-full" style={{ background: coverFor(a.color).from }} aria-hidden /> {a.courseCode} · {formatRelative(a.createdAt, now)}
                      </span>
                      <span className="mt-0.5 block font-medium group-hover:text-accent">{a.title}</span>
                      <span className="line-clamp-2 text-muted">{a.body}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Study timer" icon={<Timer />}>
            <StudyTimer />
          </Card>
          <TaskList userId={user.id} />
        </div>
      </div>
    </>
  );
}
