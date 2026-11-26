import type { Metadata } from "next";
import { Info } from "lucide-react";
import { LiveForm } from "@/components/client/live-form";
import { LiveList } from "@/components/live-list";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireTeacher } from "@/lib/auth/dal";
import { listLiveSessions, listTeacherClasses } from "@/lib/data";
import { requestTime } from "@/lib/format";

export const metadata: Metadata = { title: "Live classes" };

export default async function TeacherLivePage() {
  const teacher = await requireTeacher();
  const classes = await listTeacherClasses(teacher.id);
  const sessions = await listLiveSessions(classes.map((c) => c.id));

  return (
    <>
      <PageHeader title="Live classes" subtitle="Video lessons on Jitsi Meet: free, open-source, no account needed for students." />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card title="Upcoming & live">
          <LiveList sessions={sessions} now={requestTime()} manage displayName={teacher.name} />
        </Card>
        <div className="space-y-6">
          <Card title="Schedule a live class">
            {classes.length ? <LiveForm classes={classes.map((c) => ({ id: c.id, name: c.name }))} /> : <Empty>Create a class first.</Empty>}
          </Card>
          <Card>
            <div className="flex gap-3 text-sm text-muted">
              <Info className="mt-0.5 size-4 shrink-0" />
              <p>
                On meet.jit.si the first person to join a room is asked to sign in (Google, GitHub or Facebook) to become the
                moderator, so start the class yourself before students join. Each room has a long random name, so only people
                with the link can find it. Schools can self-host Jitsi for free and set <code>JITSI_DOMAIN</code>.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
