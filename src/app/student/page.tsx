import type { Metadata } from "next";
import Link from "next/link";
import { TaskList } from "@/components/task-list";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireStudent } from "@/lib/auth/dal";
import { listStudentQuizzes } from "@/lib/data";
import { formatDateTime, requestTime } from "@/lib/format";
import { isAttemptOpen } from "@/lib/quiz-engine";

export const metadata: Metadata = { title: "Quizzes" };

type QuizRow = Awaited<ReturnType<typeof listStudentQuizzes>>[number];

function status(q: QuizRow, now: number) {
  if (q.submittedAt) return { label: `${q.score} / ${q.total}`, tone: "success" as const, done: true };
  if (q.startedAt) {
    return isAttemptOpen({ startedAt: q.startedAt }, q, now)
      ? { label: "In progress", tone: "accent" as const, done: false }
      : { label: "Time up: view result", tone: "neutral" as const, done: true };
  }
  if (q.deadline.getTime() < now) return { label: "Missed", tone: "danger" as const, done: true };
  return { label: "Not started", tone: "accent" as const, done: false };
}

export default async function StudentHome() {
  const student = await requireStudent();
  const quizzes = await listStudentQuizzes(student.id, student.classId);
  const now = requestTime();
  const rows = quizzes.map((q) => ({ ...q, status: status(q, now) }));
  const todo = rows.filter((q) => !q.status.done);
  const done = rows.filter((q) => q.status.done);

  return (
    <>
      <PageHeader title={`Hi, ${student.name.split(" ")[0]}`} subtitle="Your quizzes and tasks." />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card title="To do">
            {todo.length === 0 ? <Empty>You&apos;re all caught up.</Empty> : <QuizList rows={todo} />}
          </Card>
          <Card title="Finished">
            {done.length === 0 ? <Empty>No finished quizzes yet.</Empty> : <QuizList rows={done} />}
          </Card>
        </div>
        <TaskList userId={student.id} />
      </div>
    </>
  );
}

function QuizList({ rows }: { rows: (QuizRow & { status: ReturnType<typeof status> })[] }) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((q) => (
        <li key={q.id}>
          <Link href={`/student/quizzes/${q.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-accent">
            <span>
              <span className="font-medium">{q.title}</span>
              <span className="block text-sm text-muted">
                {q.subject} · {q.timeLimitMinutes} min · due {formatDateTime(q.deadline)}
              </span>
            </span>
            <Badge tone={q.status.tone}>{q.status.label}</Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
