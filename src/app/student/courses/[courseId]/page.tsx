import { ClipboardCheck, Info, LayoutList, Megaphone, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { Tabs } from "@/components/client/tabs";
import { CourseHero } from "@/components/course/course-hero";
import { Discussions } from "@/components/course/discussions";
import { CourseOutline } from "@/components/course/outline";
import { Markdown, plainText } from "@/components/markdown";
import { Badge, Card, Empty, Table } from "@/components/ui";
import { db } from "@/db";
import { courseForStudent } from "@/lib/access";
import { requireStudent } from "@/lib/auth/dal";
import { recentAnnouncements } from "@/lib/data/community";
import { courseOutline } from "@/lib/data/courses";
import { gradebook } from "@/lib/data/gradebook";
import { formatDateTime, formatPercent, formatRelative, requestTime } from "@/lib/format";
import { jitsiLink } from "@/lib/live";
import { routeIds } from "@/lib/route-ids";

export default async function StudentCoursePage({ params }: PageProps<"/student/courses/[courseId]">) {
  const { courseId } = routeIds(await params);
  const user = await requireStudent();
  const course = await courseForStudent(user, courseId);
  const now = requestTime();
  const [outline, book, instructor, live, [announcement]] = await Promise.all([
    courseOutline(course.id, user.id),
    gradebook(course.id, user.id),
    db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, course.instructorId), columns: { name: true } }),
    db.query.liveSessions.findMany({ where: (l, { eq }) => eq(l.courseId, course.id) }),
    recentAnnouncements([course.id], 1),
  ]);
  const items = outline.flatMap((s) => s.items);
  const progress = items.length ? (items.filter((i) => i.done).length / items.length) * 100 : 0;
  const liveLinks = Object.fromEntries(live.map((l) => [l.id, jitsiLink(l, user.name, now)]).filter(([, v]) => v)) as Record<string, string>;
  const mine = book.rows[0];

  return (
    <>
      <CourseHero course={course} instructor={instructor?.name} progress={progress} breadcrumbs={[{ label: "My courses", href: "/student/courses" }, { label: course.code }]} />

      <Tabs
        tabs={[
          {
            id: "content",
            label: <><LayoutList className="size-4" /> Content</>,
            content: (
              <div className="grid gap-6 xl:grid-cols-[1fr_20rem] [&>*]:min-w-0">
                <CourseOutline courseId={course.id} sections={outline} mode="student" now={now} liveLinks={liveLinks} />
                <div className="space-y-6">
                  {announcement && (
                    <Link href={`/student/courses/${course.id}/discussions/${announcement.id}`} className="card-hover block rounded-2xl border border-accent/30 bg-accent/5 p-4 text-sm">
                      <p className="flex items-center gap-2 text-xs font-medium text-accent"><Megaphone className="size-3.5" /> Latest announcement · {formatRelative(announcement.createdAt, now)}</p>
                      <p className="mt-1 font-medium">{announcement.title}</p>
                      <p className="mt-0.5 line-clamp-3 text-muted">{plainText(announcement.body)}</p>
                    </Link>
                  )}
                  {course.description && (
                    <Card title="About this course" icon={<Info />}>
                      <Markdown text={course.description} className="prose-chat text-sm text-muted" />
                    </Card>
                  )}
                </div>
              </div>
            ),
          },
          { id: "discussions", label: <><MessagesSquare className="size-4" /> Discussions</>, content: <Discussions courseId={course.id} role="student" now={now} /> },
          {
            id: "grades",
            label: <><ClipboardCheck className="size-4" /> Grades</>,
            content: (
              <Card
                title="Your grades"
                description="Missing work counts as 0 once the deadline passes. Assignments count once graded."
                action={mine?.total.letter && <span className="bg-brand rounded-xl px-3 py-1.5 text-sm font-semibold text-white">{mine.total.letter.letter} · {formatPercent(mine.total.percent)}</span>}
              >
                {!mine || book.items.length === 0 ? (
                  <Empty>No graded work yet.</Empty>
                ) : (
                  <Table head={["Item", "Due", "Status", "Score"]}>
                    {book.items.map((it) => {
                      const c = mine.cells[it.id];
                      return (
                        <tr key={it.id}>
                          <td className="px-2 py-2">
                            <Link href={`/student/${it.kind === "assignment" ? "assignments" : "quizzes"}/${it.id}`} className="font-medium hover:text-accent">{it.title}</Link>
                            <span className="block text-xs capitalize text-muted">{it.kind}</span>
                          </td>
                          <td className="px-2 py-2 text-muted">{formatDateTime(it.due)}</td>
                          <td className="px-2 py-2">
                            {c.status === "graded" && <Badge tone="success">Graded</Badge>}
                            {c.status === "submitted" && <Badge tone="accent">Awaiting grade</Badge>}
                            {c.status === "missing" && <Badge tone="danger">Missing</Badge>}
                            {c.status === "upcoming" && <Badge>Upcoming</Badge>}
                          </td>
                          <td className="px-2 py-2 tabular-nums">{c.earned != null ? `${c.earned} / ${c.possible}` : `– / ${c.possible}`}</td>
                        </tr>
                      );
                    })}
                  </Table>
                )}
              </Card>
            ),
          },
        ]}
      />
    </>
  );
}
