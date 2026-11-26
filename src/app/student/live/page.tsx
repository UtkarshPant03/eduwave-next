import type { Metadata } from "next";
import { LiveList } from "@/components/live-list";
import { Card, PageHeader } from "@/components/ui";
import { requireStudent } from "@/lib/auth/dal";
import { listLiveSessions } from "@/lib/data";
import { requestTime } from "@/lib/format";

export const metadata: Metadata = { title: "Live classes" };

export default async function StudentLivePage() {
  const student = await requireStudent();
  const sessions = await listLiveSessions([student.classId]);
  return (
    <>
      <PageHeader title="Live classes" subtitle="Join opens 15 minutes before the start. Classes open in Jitsi Meet in a new tab; no account needed." />
      <Card>
        <LiveList sessions={sessions} now={requestTime()} displayName={student.name} />
      </Card>
    </>
  );
}
