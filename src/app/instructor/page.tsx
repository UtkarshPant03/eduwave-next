import type { Metadata } from "next";
import { ArrowRight, BookOpen, CalendarClock, Inbox, Users, Video } from "lucide-react";
import Link from "next/link";
import { CourseCard } from "@/components/course-cover";
import { TaskList } from "@/components/task-list";
import { Badge, Card, Empty, IconChip, PageHeader, StatTile } from "@/components/ui";
import { requireInstructor } from "@/lib/auth/dal";
import { calendarEvents } from "@/lib/data/activity";
import { gradingQueue } from "@/lib/data/assessments";
import { listInstructorCourses } from "@/lib/data/courses";
import { taughtCourseIds } from "@/lib/data/shared";
import { formatDateTime, formatRelative, requestTime } from "@/lib/format";
import { greeting } from "@/lib/greeting";

export const metadata: Metadata = { title: "Dashboard" };

export default async function InstructorHome() {
  const user = await requireInstructor();
  const now = requestTime();
  // All three in parallel: the calendar needs only course ids, not the per-course statistics.
  const [courses, queue, events] = await Promise.all([
    listInstructorCourses(user.id),
    gradingQueue(user.id),
    taughtCourseIds(user.id).then((ids) => calendarEvents(ids, new Date(now), new Date(now + 14 * 86_400_000))),
  ]);
  const students = courses.reduce((s, c) => s + c.students, 0);
  const toGrade = courses.reduce((s, c) => s + c.toGrade, 0);

  return (
    <>
      <PageHeader eyebrow={greeting(now)} title={user.name} subtitle="Here's what needs your attention across your courses." />

      <div className="stagger mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Courses" value={courses.length} icon={<BookOpen />} hint={`${courses.filter((c) => c.published).length} visible to students`} />
        {/* A student in two of your courses is two enrolments: label says exactly that. */}
        <StatTile label="Enrolments" value={students} icon={<Users />} hint="across your courses" />
        <StatTile label="Awaiting grading" value={toGrade} icon={<Inbox />} tone={toGrade ? "warning" : "neutral"} />
        <StatTile label="Next 14 days" value={events.length} hint="deadlines & live classes" icon={<CalendarClock />} tone="neutral" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem] [&>*]:min-w-0">
        <div className="space-y-6">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Your courses</h2>
              <Link href="/instructor/courses" className="flex items-center gap-1 text-sm text-accent hover:underline">All courses <ArrowRight className="size-3.5" /></Link>
            </div>
            {courses.length === 0 ? (
              <Empty icon={<BookOpen />}>No courses assigned yet. An administrator creates courses and assigns them to you.</Empty>
            ) : (
              <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {courses.slice(0, 6).map((c) => <CourseCard key={c.id} course={c} href={`/instructor/courses/${c.id}`} />)}
              </div>
            )}
          </section>

          <Card title="Grading queue" icon={<Inbox />} description="Oldest submissions first.">
            {queue.length === 0 ? (
              <p className="text-sm text-muted">All caught up. Nothing to grade.</p>
            ) : (
              <ul className="divide-y divide-border">
                {queue.map((q, i) => (
                  <li key={i}>
                    <Link href={`/instructor/assignments/${q.assignmentId}`} className="group flex items-center gap-3 py-2.5 text-sm">
                      <Badge>{q.courseCode}</Badge>
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium group-hover:text-accent">{q.title}</span> <span className="text-muted">· {q.student}</span>
                      </span>
                      {q.late && <Badge tone="warning">Late</Badge>}
                      <span className="text-xs text-muted">{formatRelative(q.submittedAt, now)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Coming up" icon={<CalendarClock />}>
            {events.length === 0 ? (
              <p className="text-sm text-muted">Nothing in the next two weeks.</p>
            ) : (
              <ul className="space-y-3">
                {events.slice(0, 6).map((e) => (
                  <li key={e.id} className="flex items-start gap-3 text-sm">
                    <IconChip size="sm" tone={e.kind === "live" ? "success" : e.kind === "quiz" ? "warning" : "accent"}>
                      {e.kind === "live" ? <Video /> : <CalendarClock />}
                    </IconChip>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{e.title}</p>
                      <p className="text-xs text-muted">{e.courseCode} · {formatDateTime(e.at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <TaskList userId={user.id} />
        </div>
      </div>
    </>
  );
}
