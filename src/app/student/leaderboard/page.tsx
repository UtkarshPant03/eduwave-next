import type { Metadata } from "next";
import { Leaderboard } from "@/components/leaderboard";
import { Card, PageHeader } from "@/components/ui";
import { requireStudent } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function StudentLeaderboardPage() {
  const student = await requireStudent();
  return (
    <>
      <PageHeader title="Class leaderboard" subtitle="Ranked by average score across submitted quizzes." />
      <Card>
        <Leaderboard classId={student.classId} highlightId={student.id} />
      </Card>
    </>
  );
}
