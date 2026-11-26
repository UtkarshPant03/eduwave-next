import type { Metadata } from "next";
import { BarChart3, Lightbulb } from "lucide-react";
import { ProgressChart, SubjectBars } from "@/components/client/charts";
import { Card, Empty, PageHeader, Table } from "@/components/ui";
import { requireStudent } from "@/lib/auth/dal";
import { studentStats } from "@/lib/data";
import { formatDate, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "My progress" };

export default async function StudentStatsPage() {
  const student = await requireStudent();
  const { bySubject, history } = await studentStats(student.id);

  if (history.length === 0) {
    return (
      <>
        <PageHeader title="My progress" />
        <Empty icon={<BarChart3 />}>Finish a quiz to see your progress here.</Empty>
      </>
    );
  }

  const weakest = [...bySubject].sort((a, b) => a.averagePercent - b.averagePercent)[0];
  const progress = history.map((h, i) => ({
    quiz: `Q${i + 1}`,
    you: ((h.score ?? 0) / Math.max(h.total, 1)) * 100,
    classAverage: h.classAverage,
  }));
  const aboveAvg = progress.filter((p) => p.classAverage != null && p.you >= p.classAverage).length;

  return (
    <>
      <PageHeader title="My progress" subtitle={`${history.length} ${history.length === 1 ? "quiz" : "quizzes"} completed · at or above the class average on ${aboveAvg}`} />

      {bySubject.length > 1 && weakest && (
        <div className="mb-6 flex gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm">
          <Lightbulb className="size-5 shrink-0 text-accent" />
          <p>
            <strong>Focus suggestion:</strong> {weakest.subject} is your lowest-scoring subject ({formatPercent(weakest.averagePercent)}).
            Check the explanations on past {weakest.subject} quizzes, or ask the AI tutor to walk you through a topic.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Score per quiz" description="Your score compared with the class average on the same quiz.">
          {progress.length >= 2 ? (
            <ProgressChart data={progress} />
          ) : (
            <Empty>Finish one more quiz to see your trend over time.</Empty>
          )}
        </Card>
        <Card title="Average by subject">
          <SubjectBars data={bySubject.map((s) => ({ subject: s.subject, averagePercent: s.averagePercent }))} />
        </Card>
        <Card title="History" className="lg:col-span-2" description="The same numbers as the charts, as a table.">
          <Table head={["#", "Quiz", "Subject", "Score", "You", "Class avg", "Submitted"]}>
            {[...history].reverse().map((h, i) => (
              <tr key={i}>
                <td className="px-2 py-2 tabular-nums text-muted">Q{history.length - i}</td>
                <td className="px-2 py-2">{h.title}</td>
                <td className="px-2 py-2 text-muted">{h.subject}</td>
                <td className="px-2 py-2 tabular-nums">{h.score} / {h.total}</td>
                <td className="px-2 py-2 tabular-nums">{formatPercent(((h.score ?? 0) / Math.max(h.total, 1)) * 100)}</td>
                <td className="px-2 py-2 tabular-nums text-muted">{formatPercent(h.classAverage)}</td>
                <td className="px-2 py-2 text-muted">{h.submittedAt && formatDate(h.submittedAt)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
