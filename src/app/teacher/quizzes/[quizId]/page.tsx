import { CheckCircle2, Clock, Download, Target, Users } from "lucide-react";
import Link from "next/link";
import { deleteQuiz } from "@/app/actions/teacher";
import { ScoreDistribution } from "@/components/client/charts";
import { Badge, Button, buttonClass, Card, Empty, PageHeader, StatTile, Table } from "@/components/ui";
import { requireTeacher } from "@/lib/auth/dal";
import { getQuizAnalytics } from "@/lib/data";
import { formatDateTime, formatPercent } from "@/lib/format";

const BUCKETS = ["0–20%", "21–40%", "41–60%", "61–80%", "81–100%"];

export default async function QuizAnalyticsPage({ params }: PageProps<"/teacher/quizzes/[quizId]">) {
  const { quizId } = await params;
  const teacher = await requireTeacher();
  const { quiz, className, questionStats, results, classSize } = await getQuizAnalytics(teacher.id, quizId);

  const submitted = results.filter((r) => r.submittedAt);
  const percents = submitted.map((r) => ((r.score ?? 0) / Math.max(r.total, 1)) * 100);
  const avgPercent = percents.length ? percents.reduce((a, b) => a + b, 0) / percents.length : null;
  const avgSeconds = submitted.length
    ? submitted.reduce((s, r) => s + (r.submittedAt!.getTime() - r.startedAt.getTime()) / 1000, 0) / submitted.length
    : null;
  const buckets = BUCKETS.map((range, i) => ({
    range,
    students: percents.filter((p) => (i === 0 ? p <= 20 : p > i * 20 && p <= (i + 1) * 20)).length,
  }));
  const hardest = [...questionStats].filter((q) => q.answered > 0).sort((a, b) => a.correct / a.answered - b.correct / b.answered)[0];

  return (
    <>
      <PageHeader
        title={quiz.title}
        subtitle={
          <>
            <Link href={`/teacher/classes/${quiz.classId}`} className="underline">{className}</Link> · {quiz.subject} ·{" "}
            {quiz.timeLimitMinutes} min · due {formatDateTime(quiz.deadline)} {quiz.shuffle && <Badge>Shuffled</Badge>}
          </>
        }
        action={
          <>
            <a href={`/teacher/quizzes/${quiz.id}/export`} className={buttonClass("secondary")}>
              <Download className="size-4" /> Export CSV
            </a>
            <form action={deleteQuiz}>
              <input type="hidden" name="quizId" value={quiz.id} />
              <Button variant="danger">Delete quiz</Button>
            </form>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Submitted" value={`${submitted.length} / ${classSize}`} icon={<Users />} />
        <StatTile label="Class average" value={formatPercent(avgPercent)} icon={<Target />} />
        <StatTile label="Avg. time taken" value={avgSeconds == null ? "–" : `${Math.floor(avgSeconds / 60)}m ${Math.round(avgSeconds % 60)}s`} icon={<Clock />} />
        <StatTile label="Questions" value={questionStats.length} icon={<CheckCircle2 />} hint={hardest ? `Hardest: Q${hardest.position + 1}` : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Score distribution" description="Number of students in each score band.">
          {submitted.length ? <ScoreDistribution buckets={buckets} /> : <Empty>No submissions yet.</Empty>}
        </Card>

        <Card title="Results">
          {results.length === 0 ? (
            <Empty>No one has started this quiz yet.</Empty>
          ) : (
            <Table head={["Student", "Score", "Time"]}>
              {results.map((r) => (
                <tr key={r.rollNumber}>
                  <td className="px-2 py-2"><span className="font-mono text-xs text-muted">{r.rollNumber}</span> {r.name}</td>
                  <td className="px-2 py-2 tabular-nums">{r.submittedAt ? `${r.score} / ${r.total}` : <Badge tone="accent">In progress</Badge>}</td>
                  <td className="px-2 py-2 tabular-nums">{r.submittedAt ? formatDuration(r.submittedAt.getTime() - r.startedAt.getTime()) : "–"}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Question breakdown" className="lg:col-span-2" description="How many students picked each option. A popular wrong answer usually points to a specific misconception.">
          <ol className="grid gap-5 md:grid-cols-2">
            {questionStats.map((q, i) => {
              const rate = q.answered > 0 ? (q.correct / q.answered) * 100 : null;
              const max = Math.max(1, ...q.optionCounts);
              return (
                <li key={q.id} className="rounded-lg border border-border p-4 text-sm">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <p className="font-medium">{i + 1}. {q.prompt}</p>
                    <Badge tone={rate == null ? "neutral" : rate >= 70 ? "success" : rate >= 40 ? "warning" : "danger"}>
                      {formatPercent(rate)} correct
                    </Badge>
                  </div>
                  <ul className="space-y-1.5">
                    {q.options.map((opt, k) => {
                      const isCorrect = k === q.correctIndex;
                      return (
                        <li key={k} className="grid grid-cols-[minmax(0,1fr)_6rem_2rem] items-center gap-2">
                          <span className={`flex items-center gap-1.5 truncate ${isCorrect ? "font-medium" : "text-muted"}`}>
                            {isCorrect && <CheckCircle2 className="size-3.5 shrink-0 text-[var(--status-good)]" aria-label="Correct answer" />}
                            {opt}
                          </span>
                          <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                            <span
                              className="block h-full rounded-full"
                              style={{ width: `${(q.optionCounts[k] / max) * 100}%`, background: isCorrect ? "var(--status-good)" : "var(--series-1)" }}
                            />
                          </span>
                          <span className="text-right text-xs tabular-nums text-muted">{q.optionCounts[k]}</span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </>
  );
}

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
