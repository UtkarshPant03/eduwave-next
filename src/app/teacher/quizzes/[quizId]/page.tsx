import Link from "next/link";
import { deleteQuiz } from "@/app/actions/teacher";
import { Badge, Button, Card, Empty, PageHeader, Table } from "@/components/ui";
import { requireTeacher } from "@/lib/auth/dal";
import { getQuizAnalytics } from "@/lib/data";
import { formatDateTime, formatPercent } from "@/lib/format";

export default async function QuizAnalyticsPage({ params }: PageProps<"/teacher/quizzes/[quizId]">) {
  const { quizId } = await params;
  const teacher = await requireTeacher();
  const { quiz, className, questionStats, results, classSize } = await getQuizAnalytics(teacher.id, quizId);

  const submitted = results.filter((r) => r.submittedAt);
  const avgPercent =
    submitted.length > 0
      ? submitted.reduce((sum, r) => sum + (r.score ?? 0) / r.total, 0) / submitted.length * 100
      : null;

  return (
    <>
      <PageHeader
        title={quiz.title}
        subtitle={
          <>
            <Link href={`/teacher/classes/${quiz.classId}`} className="underline">{className}</Link> · {quiz.subject} ·{" "}
            {quiz.timeLimitMinutes} min · due {formatDateTime(quiz.deadline)}
          </>
        }
        action={
          <form action={deleteQuiz}>
            <input type="hidden" name="quizId" value={quiz.id} />
            <Button variant="danger">Delete quiz</Button>
          </form>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Submitted" value={`${submitted.length} / ${classSize}`} />
        <Stat label="Class average" value={formatPercent(avgPercent)} />
        <Stat label="Questions" value={String(questionStats.length)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Questions">
          <p className="mb-3 text-sm text-muted">
            Questions most students got wrong are worth revisiting in class.
          </p>
          <ol className="space-y-4">
            {questionStats.map((q, i) => {
              const rate = q.answered > 0 ? (q.correct / q.answered) * 100 : null;
              return (
                <li key={q.id} className="text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{i + 1}. {q.prompt}</p>
                    <Badge tone={rate == null ? "neutral" : rate >= 70 ? "success" : rate >= 40 ? "accent" : "danger"}>
                      {formatPercent(rate)} correct
                    </Badge>
                  </div>
                  <p className="mt-1 text-muted">
                    Answer: {q.options[q.correctIndex]} · {q.answered} answered
                  </p>
                </li>
              );
            })}
          </ol>
        </Card>

        <Card title="Results">
          {results.length === 0 ? (
            <Empty>No one has started this quiz yet.</Empty>
          ) : (
            <Table head={["Student", "Score", "Time taken"]}>
              {results.map((r) => (
                <tr key={r.rollNumber}>
                  <td className="px-2 py-2">
                    <span className="font-mono text-muted">{r.rollNumber}</span> {r.name}
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    {r.submittedAt ? `${r.score} / ${r.total}` : <Badge tone="accent">In progress</Badge>}
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    {r.submittedAt ? formatDuration(r.submittedAt.getTime() - r.startedAt.getTime()) : "–"}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
