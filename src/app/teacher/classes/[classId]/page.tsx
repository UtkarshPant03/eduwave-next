import Link from "next/link";
import { addResource, addStudent, deleteResource, removeStudent } from "@/app/actions/teacher";
import { ActionForm } from "@/components/action-form";
import { Leaderboard } from "@/components/leaderboard";
import { Badge, buttonClass, Card, Empty, Field, Input, PageHeader, Table } from "@/components/ui";
import { requireTeacher } from "@/lib/auth/dal";
import { getTeacherClass, listClassQuizzes, listClassStudents, listResources } from "@/lib/data";
import { formatDateTime, requestTime } from "@/lib/format";

export default async function ClassPage({ params }: PageProps<"/teacher/classes/[classId]">) {
  const { classId } = await params;
  const teacher = await requireTeacher();
  const klass = await getTeacherClass(teacher.id, classId);
  const [students, quizzes, resources] = await Promise.all([
    listClassStudents(classId),
    listClassQuizzes(classId),
    listResources(classId),
  ]);
  const now = requestTime();

  return (
    <>
      <PageHeader
        title={klass.name}
        subtitle={`${students.length} students · ${quizzes.length} quizzes`}
        action={
          <Link href={`/teacher/classes/${classId}/quizzes/new`} className={buttonClass()}>
            New quiz
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Quizzes" className="lg:col-span-2">
          {quizzes.length === 0 ? (
            <Empty>No quizzes yet.</Empty>
          ) : (
            <Table head={["Title", "Subject", "Deadline", "Submissions", ""]}>
              {quizzes.map((q) => (
                <tr key={q.id}>
                  <td className="px-2 py-2 font-medium">{q.title}</td>
                  <td className="px-2 py-2">{q.subject}</td>
                  <td className="px-2 py-2">
                    {formatDateTime(q.deadline)}{" "}
                    {q.deadline.getTime() < now ? <Badge>Closed</Badge> : <Badge tone="accent">Open</Badge>}
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    {q.submissions} / {students.length}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Link href={`/teacher/quizzes/${q.id}`} className="text-accent underline">
                      Analytics
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Students">
          {students.length === 0 ? (
            <Empty>No students yet. Add one below.</Empty>
          ) : (
            <ul className="mb-5 divide-y divide-border">
              {students.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <span className="font-mono text-muted">{s.rollNumber}</span> {s.name}
                  </span>
                  <form action={removeStudent}>
                    <input type="hidden" name="classId" value={classId} />
                    <input type="hidden" name="studentId" value={s.id} />
                    <button className="text-xs text-muted hover:text-danger">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mb-3 text-sm font-semibold">Add student</h3>
          <ActionForm action={addStudent} submitLabel="Add student">
            <input type="hidden" name="classId" value={classId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <Input name="name" required />
              </Field>
              <Field label="Roll number">
                <Input name="rollNumber" required pattern="[A-Za-z0-9\-]{2,20}" />
              </Field>
            </div>
            <Field label="Initial password" hint="At least 8 characters. Share it with the student privately.">
              <Input name="password" type="text" minLength={8} required autoComplete="off" />
            </Field>
          </ActionForm>
        </Card>

        <Card title="Resources">
          {resources.length === 0 ? (
            <Empty>No resources shared yet.</Empty>
          ) : (
            <ul className="mb-5 divide-y divide-border">
              {resources.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                      {r.title}
                    </a>{" "}
                    <Badge>{r.subject}</Badge>
                  </span>
                  <form action={deleteResource}>
                    <input type="hidden" name="classId" value={classId} />
                    <input type="hidden" name="resourceId" value={r.id} />
                    <button className="text-xs text-muted hover:text-danger">Delete</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mb-3 text-sm font-semibold">Share a link</h3>
          <ActionForm action={addResource} submitLabel="Share resource">
            <input type="hidden" name="classId" value={classId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title">
                <Input name="title" required />
              </Field>
              <Field label="Subject">
                <Input name="subject" required />
              </Field>
            </div>
            <Field label="URL">
              <Input name="url" type="url" placeholder="https://…" required />
            </Field>
          </ActionForm>
        </Card>

        <Card title="Leaderboard" className="lg:col-span-2">
          <Leaderboard classId={classId} />
        </Card>
      </div>
    </>
  );
}
