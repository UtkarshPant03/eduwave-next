import type { Metadata } from "next";
import { Card, Empty, PageHeader, Table } from "@/components/ui";
import { requireStudent } from "@/lib/auth/dal";
import { studentStats } from "@/lib/data";
import { formatDateTime, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "My stats" };

export default async function StudentStatsPage() {
  const student = await requireStudent();
  const { bySubject, history } = await studentStats(student.id);
  const weakest = [...bySubject].sort((a, b) => a.averagePercent - b.averagePercent)[0];

  return (
    <>
      <PageHeader
        title="My stats"
        subtitle={weakest && bySubject.length > 1 ? `Focus suggestion: ${weakest.subject} is your lowest-scoring subject.` : undefined}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="By subject">
          {bySubject.length === 0 ? (
            <Empty>Finish a quiz to see your stats.</Empty>
          ) : (
            <Table head={["Subject", "Quizzes", "Average"]}>
              {bySubject.map((s) => (
                <tr key={s.subject}>
                  <td className="px-2 py-2">{s.subject}</td>
                  <td className="px-2 py-2 tabular-nums">{s.quizzesTaken}</td>
                  <td className="px-2 py-2 tabular-nums">{formatPercent(s.averagePercent)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="History">
          {history.length === 0 ? (
            <Empty>No submitted quizzes yet.</Empty>
          ) : (
            <Table head={["Quiz", "Score", "Submitted"]}>
              {history.map((h, i) => (
                <tr key={i}>
                  <td className="px-2 py-2">
                    {h.title} <span className="text-muted">· {h.subject}</span>
                  </td>
                  <td className="px-2 py-2 tabular-nums">{h.score} / {h.total}</td>
                  <td className="px-2 py-2">{h.submittedAt && formatDateTime(h.submittedAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
