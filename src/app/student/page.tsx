import type { Metadata } from "next";
import { AlarmClock, CheckCircle2, ClipboardList, Flame, Target, Timer, Video } from "lucide-react";
import Link from "next/link";
import { StudyTimer } from "@/components/client/study-timer";
import { TaskList } from "@/components/task-list";
import { Badge, buttonClass, Card, Empty, PageHeader, StatTile } from "@/components/ui";
import { requireStudent } from "@/lib/auth/dal";
import { listLiveSessions, listStudentQuizzes } from "@/lib/data";
import { formatDateTime, formatPercent, formatRelative, requestTime } from "@/lib/format";
import { isAttemptOpen } from "@/lib/quiz-engine";

export const metadata: Metadata = { title: "Dashboard" };

type QuizRow = Awaited<ReturnType<typeof listStudentQuizzes>>[number];

function status(q: QuizRow, now: number) {
  if (q.submittedAt) return { label: `${q.score} / ${q.total}`, tone: "success" as const, done: true };
  if (q.startedAt) {
    return isAttemptOpen({ startedAt: q.startedAt }, q, now)
      ? { label: "In progress", tone: "warning" as const, done: false }
      : { label: "Time up: view result", tone: "neutral" as const, done: true };
  }
  if (q.deadline.getTime() < now) return { label: "Missed", tone: "danger" as const, done: true };
  return { label: "Not started", tone: "accent" as const, done: false };
}

export default async function StudentHome() {
  const student = await requireStudent();
  const [quizzes, live] = await Promise.all([listStudentQuizzes(student.id, student.classId), listLiveSessions([student.classId])]);
  const now = requestTime();
  const rows = quizzes.map((q) => ({ ...q, status: status(q, now) }));
  const todo = rows.filter((q) => !q.status.done).sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
  const done = rows.filter((q) => q.status.done);
  const submitted = rows.filter((q) => q.submittedAt);
  const avg = submitted.length ? submitted.reduce((s, q) => s + (q.score ?? 0) / Math.max(q.total ?? 1, 1), 0) / submitted.length * 100 : null;
  const next = todo[0];
  const liveNow = live.find((l) => l.startsAt.getTime() <= now);

  return (
    <>
      <PageHeader title={`Hi, ${student.name.split(" ")[0]} 👋`} subtitle="Here's what's next for you." />

      {liveNow && (
        <Link href="/student/live" className="mb-6 flex items-center gap-3 rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm animate-fade-in hover:bg-danger/10">
          <Video className="size-5 text-danger" />
          <span className="flex-1"><strong>{liveNow.title}</strong> is live now.</span>
          <span className={buttonClass()}>Join</span>
        </Link>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="To do" value={todo.length} icon={<ClipboardList />} />
        <StatTile label="Completed" value={submitted.length} icon={<CheckCircle2 />} />
        <StatTile label="Average score" value={formatPercent(avg)} icon={<Target />} />
        <StatTile label="Next deadline" value={next ? formatRelative(next.deadline, now) : "–"} icon={<AlarmClock />} hint={next?.title} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card title="To do">
            {todo.length === 0 ? <Empty icon={<Flame />}>You&apos;re all caught up!</Empty> : <QuizList rows={todo} now={now} />}
          </Card>
          <Card title="Finished">
            {done.length === 0 ? <Empty>No finished quizzes yet.</Empty> : <QuizList rows={done} now={now} />}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title={<span className="flex items-center gap-2"><Timer className="size-4" /> Study timer</span>}>
            <StudyTimer />
          </Card>
          {live.length > 0 && (
            <Card title="Upcoming live classes" action={<Link href="/student/live" className="text-sm text-accent hover:underline">All</Link>}>
              <ul className="space-y-2 text-sm">
                {live.slice(0, 3).map((l) => (
                  <li key={l.id}>
                    <p className="font-medium">{l.title}</p>
                    <p className="text-xs text-muted">{formatDateTime(l.startsAt)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <TaskList userId={student.id} />
        </div>
      </div>
    </>
  );
}

function QuizList({ rows, now }: { rows: (QuizRow & { status: ReturnType<typeof status> })[]; now: number }) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((q) => {
        const urgent = !q.status.done && q.deadline.getTime() - now < 24 * 3_600_000;
        return (
          <li key={q.id}>
            <Link href={`/student/quizzes/${q.id}`} className="group flex items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block truncate font-medium group-hover:text-accent">{q.title}</span>
                <span className="block text-sm text-muted">
                  {q.subject} · {q.timeLimitMinutes} min · {q.status.done ? `due ${formatDateTime(q.deadline)}` : (
                    <span className={urgent ? "font-medium text-danger" : ""}>closes {formatRelative(q.deadline, now)}</span>
                  )}
                </span>
              </span>
              <Badge tone={q.status.tone}>{q.status.label}</Badge>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
