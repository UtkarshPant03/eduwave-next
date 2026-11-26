import type { Metadata } from "next";
import Link from "next/link";
import { createClass } from "@/app/actions/teacher";
import { ActionForm } from "@/components/action-form";
import { TaskList } from "@/components/task-list";
import { Card, Empty, Field, Input, PageHeader } from "@/components/ui";
import { requireTeacher } from "@/lib/auth/dal";
import { listTeacherClasses } from "@/lib/data";

export const metadata: Metadata = { title: "Classes" };

export default async function TeacherHome() {
  const teacher = await requireTeacher();
  const classes = await listTeacherClasses(teacher.id);

  return (
    <>
      <PageHeader title={`Welcome, ${teacher.name.split(" ")[0]}`} subtitle="Your classes, quizzes and tasks." />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card title="Your classes">
            {classes.length === 0 ? (
              <Empty>Create your first class to start adding students.</Empty>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {classes.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/teacher/classes/${c.id}`}
                      className="block rounded-md border border-border p-4 hover:border-accent"
                    >
                      <p className="font-medium">{c.name}</p>
                      <p className="mt-1 text-sm text-muted">
                        {c.studentCount} students · {c.quizCount} quizzes
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="New class">
            <ActionForm action={createClass} submitLabel="Create class">
              <Field label="Class name">
                <Input name="name" placeholder="e.g. Class 10-B" required maxLength={60} />
              </Field>
            </ActionForm>
          </Card>
        </div>
        <TaskList userId={teacher.id} />
      </div>
    </>
  );
}
