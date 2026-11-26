import { BookOpen, ClipboardList, Plus, Trophy, Users, Video } from "lucide-react";
import Link from "next/link";
import { deleteClass } from "@/app/actions/teacher";
import { LiveForm } from "@/components/client/live-form";
import { ResourceForm } from "@/components/client/resource-form";
import { StudentsPanel } from "@/components/client/students-panel";
import { Tabs } from "@/components/client/tabs";
import { Leaderboard } from "@/components/leaderboard";
import { LiveList } from "@/components/live-list";
import { ResourceList } from "@/components/resource-list";
import { Badge, Button, buttonClass, Card, Empty, PageHeader, Table } from "@/components/ui";
import { requireTeacher } from "@/lib/auth/dal";
import { getTeacherClass, listClassQuizzes, listClassStudents, listLiveSessions, listResources } from "@/lib/data";
import { formatDateTime, formatPercent, requestTime } from "@/lib/format";
import { ACCEPT_ATTR } from "@/lib/uploads";

export default async function ClassPage({ params }: PageProps<"/teacher/classes/[classId]">) {
  const { classId } = await params;
  const teacher = await requireTeacher();
  const klass = await getTeacherClass(teacher.id, classId);
  const [students, quizzes, resources, live] = await Promise.all([
    listClassStudents(classId),
    listClassQuizzes(classId),
    listResources(classId),
    listLiveSessions([classId]),
  ]);
  const now = requestTime();

  const label = (icon: React.ReactNode, text: string, n?: number) => (
    <>
      {icon} {text} {n != null && <span className="rounded-full bg-surface-2 px-1.5 text-xs tabular-nums">{n}</span>}
    </>
  );

  return (
    <>
      <PageHeader
        title={klass.name}
        subtitle={`${students.length} students · ${quizzes.length} quizzes · ${resources.length} resources`}
        action={
          <Link href={`/teacher/classes/${classId}/quizzes/new`} className={buttonClass()}>
            <Plus className="size-4" /> New quiz
          </Link>
        }
      />

      <Tabs
        tabs={[
          {
            id: "quizzes",
            label: label(<ClipboardList className="size-4" />, "Quizzes", quizzes.length),
            content: (
              <Card>
                {quizzes.length === 0 ? (
                  <Empty icon={<ClipboardList />}>No quizzes yet. Create one, or draft questions with AI.</Empty>
                ) : (
                  <Table head={["Title", "Deadline", "Submitted", "Average", ""]}>
                    {quizzes.map((q) => (
                      <tr key={q.id}>
                        <td className="px-2 py-2">
                          <span className="font-medium">{q.title}</span>
                          <span className="block text-xs text-muted">{q.subject} · {q.timeLimitMinutes} min</span>
                        </td>
                        <td className="px-2 py-2">
                          {formatDateTime(q.deadline)}{" "}
                          {q.deadline.getTime() < now ? <Badge>Closed</Badge> : <Badge tone="accent">Open</Badge>}
                        </td>
                        <td className="px-2 py-2 tabular-nums">{q.submissions} / {students.length}</td>
                        <td className="px-2 py-2 tabular-nums">{formatPercent(q.averagePercent)}</td>
                        <td className="px-2 py-2 text-right">
                          <Link href={`/teacher/quizzes/${q.id}`} className="text-accent hover:underline">Analytics →</Link>
                        </td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Card>
            ),
          },
          {
            id: "students",
            label: label(<Users className="size-4" />, "Students", students.length),
            content: (
              <Card>
                <StudentsPanel classId={classId} className={klass.name} students={students} />
              </Card>
            ),
          },
          {
            id: "resources",
            label: label(<BookOpen className="size-4" />, "Resources", resources.length),
            content: (
              <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
                <Card title="Shared resources"><ResourceList resources={resources} manageClassId={classId} /></Card>
                <Card title="Share something"><ResourceForm classId={classId} accept={ACCEPT_ATTR} /></Card>
              </div>
            ),
          },
          {
            id: "live",
            label: label(<Video className="size-4" />, "Live classes", live.length),
            content: (
              <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
                <Card title="Upcoming"><LiveList sessions={live} now={now} manage displayName={teacher.name} /></Card>
                <Card title="Schedule a live class"><LiveForm classes={[]} fixedClassId={classId} /></Card>
              </div>
            ),
          },
          {
            id: "leaderboard",
            label: label(<Trophy className="size-4" />, "Leaderboard"),
            content: (
              <Card>
                <Leaderboard classId={classId} />
              </Card>
            ),
          },
        ]}
      />

      <details className="mt-10 text-sm">
        <summary className="cursor-pointer text-muted">Danger zone</summary>
        <form action={deleteClass} className="mt-3 flex items-center gap-3">
          <input type="hidden" name="classId" value={classId} />
          <Button variant="danger" size="sm">Delete this class</Button>
          <span className="text-xs text-muted">Deletes its quizzes, attempts, resources and live sessions. Students are kept but unassigned.</span>
        </form>
      </details>
    </>
  );
}
