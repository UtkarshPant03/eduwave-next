import { classLeaderboard } from "@/lib/data";
import { formatPercent } from "@/lib/format";
import { Empty, Table } from "./ui";

/** Ranked by average percentage, so missing a quiz doesn't help or hurt the average. */
export async function Leaderboard({ classId, highlightId }: { classId: string; highlightId?: string }) {
  const rows = await classLeaderboard(classId);
  if (rows.length === 0) return <Empty>No submitted quizzes yet.</Empty>;

  return (
    <Table head={["#", "Student", "Quizzes", "Average", "Total score"]}>
      {rows.map((r, i) => (
        <tr key={r.studentId} className={r.studentId === highlightId ? "bg-accent/10 font-medium" : undefined}>
          <td className="px-2 py-2 tabular-nums">{i + 1}</td>
          <td className="px-2 py-2">{r.name}{r.studentId === highlightId && " (you)"}</td>
          <td className="px-2 py-2 tabular-nums">{r.quizzesTaken}</td>
          <td className="px-2 py-2 tabular-nums">{formatPercent(r.averagePercent)}</td>
          <td className="px-2 py-2 tabular-nums">{r.totalScore}</td>
        </tr>
      ))}
    </Table>
  );
}
