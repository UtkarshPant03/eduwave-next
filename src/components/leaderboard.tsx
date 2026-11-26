import { Medal, Trophy } from "lucide-react";
import { classLeaderboard } from "@/lib/data";
import { formatPercent } from "@/lib/format";
import { Avatar, cx, Empty, Table } from "./ui";

const PODIUM = [
  { place: 2, height: "h-20", ring: "ring-slate-400" },
  { place: 1, height: "h-28", ring: "ring-amber-400" },
  { place: 3, height: "h-14", ring: "ring-orange-700/60" },
];

/** Ranked by average percentage, so missing a quiz doesn't help or hurt the average. */
export async function Leaderboard({ classId, highlightId }: { classId: string; highlightId?: string }) {
  const rows = await classLeaderboard(classId);
  if (rows.length === 0) return <Empty icon={<Trophy />}>No submitted quizzes yet.</Empty>;

  return (
    <div className="space-y-6">
      {rows.length >= 3 && (
        <div className="mx-auto grid max-w-md grid-cols-3 items-end gap-3 pt-4" aria-label="Top three">
          {PODIUM.map(({ place, height, ring }) => {
            const r = rows[place - 1];
            return (
              <div key={place} className="flex flex-col items-center gap-2 text-center animate-fade-in">
                <span className={cx("rounded-full ring-2 ring-offset-2 ring-offset-surface", ring)}>
                  <Avatar name={r.name} />
                </span>
                <p className={cx("w-full truncate text-sm", r.studentId === highlightId && "font-semibold text-accent")}>{r.name}</p>
                <p className="text-xs tabular-nums text-muted">{formatPercent(r.averagePercent)}</p>
                <div className={cx("grid w-full place-items-center rounded-t-lg bg-accent/10", height)}>
                  <span className="flex items-center gap-1 text-lg font-semibold text-accent">
                    {place === 1 ? <Trophy className="size-4" /> : <Medal className="size-4" />}
                    {place}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Table head={["#", "Student", "Quizzes", "Average", "Total score"]}>
        {rows.map((r, i) => (
          <tr key={r.studentId} className={r.studentId === highlightId ? "bg-accent/10 font-medium" : undefined}>
            <td className="px-2 py-2 tabular-nums">{i + 1}</td>
            <td className="px-2 py-2">
              <span className="flex items-center gap-2">
                <Avatar name={r.name} size="sm" />
                {r.name}
                {r.studentId === highlightId && " (you)"}
              </span>
            </td>
            <td className="px-2 py-2 tabular-nums">{r.quizzesTaken}</td>
            <td className="px-2 py-2 tabular-nums">{formatPercent(r.averagePercent)}</td>
            <td className="px-2 py-2 tabular-nums">{r.totalScore}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
