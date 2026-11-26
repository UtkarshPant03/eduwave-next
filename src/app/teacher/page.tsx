import type { Metadata } from "next";
import { ArrowRight, ClipboardList, GraduationCap, Users, Video } from "lucide-react";
import Link from "next/link";
import { createClass } from "@/app/actions/teacher";
import { ActionForm } from "@/components/action-form";
import { TaskList } from "@/components/task-list";
import { Badge, Card, Empty, Field, Input, PageHeader, Progress, StatTile } from "@/components/ui";
import { requireTeacher } from "@/lib/auth/dal";
import { listLiveSessions, listTeacherClasses, teacherOpenQuizzes } from "@/lib/data";
import { formatDateTime, formatPercent, formatRelative, requestTime } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

export default async function TeacherHome() {
  const teacher = await requireTeacher();
  const classes = await listTeacherClasses(teacher.id);
  const [openQuizzes, live] = await Promise.all([teacherOpenQuizzes(teacher.id), listLiveSessions(classes.map((c) => c.id))]);
  const now = requestTime();
  const totalStudents = classes.reduce((s, c) => s + c.studentCount, 0);
  const hour = Number(new Intl.DateTimeFormat("en", { hour: "numeric", hour12: false, timeZone: process.env.APP_TIME_ZONE ?? "Asia/Kolkata" }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader title={`${greeting}, ${teacher.name.split(" ")[0]}`} subtitle="Here's what's happening across your classes." />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Classes" value={classes.length} icon={<GraduationCap />} />
        <StatTile label="Students" value={totalStudents} icon={<Users />} />
        <StatTile label="Open quizzes" value={openQuizzes.length} icon={<ClipboardList />} />
        <StatTile label="Upcoming live classes" value={live.length} icon={<Video />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card title="Your classes">
            {classes.length === 0 ? (
              <Empty icon={<GraduationCap />}>Create your first class to start adding students.</Empty>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {classes.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/teacher/classes/${c.id}`}
                      className="group block rounded-xl border border-border p-4 transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-semibold">{c.name}</p>
                        <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" />
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        {c.studentCount} students · {c.quizCount} quizzes
                      </p>
                      <p className="mt-2 text-xs text-muted">Class average: <span className="font-medium text-foreground">{formatPercent(c.averagePercent)}</span></p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <details className="mt-4 group">
              <summary className="cursor-pointer text-sm font-medium text-accent">+ New class</summary>
              <div className="mt-3">
                <ActionForm action={createClass} submitLabel="Create class">
                  <Field label="Class name">
                    <Input name="name" placeholder="e.g. Class 10-B" required maxLength={60} />
                  </Field>
                </ActionForm>
              </div>
            </details>
          </Card>

          <Card title="Open quizzes" description="Submission progress for quizzes that are still running.">
            {openQuizzes.length === 0 ? (
              <Empty icon={<ClipboardList />}>No open quizzes. Create one from a class page.</Empty>
            ) : (
              <ul className="space-y-4">
                {openQuizzes.map((q) => (
                  <li key={q.id}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                      <Link href={`/teacher/quizzes/${q.id}`} className="font-medium hover:text-accent">
                        {q.title} <span className="font-normal text-muted">· {q.className}</span>
                      </Link>
                      <span className="text-xs text-muted">closes {formatRelative(q.deadline, now)}</span>
                    </div>
                    <Progress value={q.classSize ? (q.submissions / q.classSize) * 100 : 0} label={`${q.title} submissions`} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Upcoming live classes" action={<Link href="/teacher/live" className="text-sm text-accent hover:underline">Schedule</Link>}>
            {live.length === 0 ? (
              <p className="text-sm text-muted">Nothing scheduled.</p>
            ) : (
              <ul className="space-y-3">
                {live.slice(0, 4).map((l) => {
                  const isLive = l.startsAt.getTime() <= now;
                  return (
                    <li key={l.id} className="text-sm">
                      <p className="flex items-center gap-2 font-medium">
                        {l.title} {isLive && <Badge tone="danger">● Live</Badge>}
                      </p>
                      <p className="text-xs text-muted">{l.className} · {formatDateTime(l.startsAt)}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <TaskList userId={teacher.id} />
        </div>
      </div>
    </>
  );
}
