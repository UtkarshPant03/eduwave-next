import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";
import { createCourse } from "@/app/actions/admin";
import { ActionForm } from "@/components/action-form";
import { PublishToggle } from "@/components/client/publish-toggle";
import { CourseCover } from "@/components/course-cover";
import { Badge, Card, Empty, Field, Input, PageHeader, Select, Table, Textarea } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/dal";
import { COURSE_COLORS } from "@/lib/course-colors";
import { listAllCourses, listInstructors } from "@/lib/data/admin";
import { listDepartments, listTerms } from "@/lib/data/institution";

export const metadata: Metadata = { title: "Courses" };

export default async function AdminCoursesPage() {
  await requireAdmin();
  const [courses, instructors, departments, terms] = await Promise.all([listAllCourses(), listInstructors(), listDepartments(), listTerms()]);
  return (
    <>
      <PageHeader eyebrow="Manage" title="Courses" subtitle={`${courses.length} course${courses.length === 1 ? "" : "s"}`} />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem] [&>*]:min-w-0">
        <Card>
          {courses.length === 0 ? (
            <Empty icon={<BookOpen />}>No courses yet. Create the first one.</Empty>
          ) : (
            <Table head={["Course", "Term", "Instructor", "Students", "Visibility"]}>
              {courses.map((c) => (
                <tr key={c.id}>
                  <td className="px-2 py-2">
                    <span className="flex items-center gap-3">
                      <CourseCover code="" color={c.color} className="size-9 shrink-0 rounded-lg" />
                      <span>
                        <Link href={`/admin/courses/${c.id}`} className="font-medium hover:underline">{c.code}</Link>
                        <span className="block text-xs text-muted">{c.title}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-2 text-muted">{c.term}<span className="block text-xs">{c.department}</span></td>
                  <td className="px-2 py-2">{c.instructor}</td>
                  <td className="px-2 py-2 tabular-nums">{c.students}</td>
                  <td className="px-2 py-2"><PublishToggle courseId={c.id} published={c.published} /> {!c.published && <Badge tone="warning">Hidden</Badge>}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="New course" icon={<Plus />}>
          {instructors.length === 0 || departments.length === 0 ? (
            <p className="text-sm text-muted">
              {instructors.length === 0 ? "Create an instructor account first (Users → New user)." : "Add a department first (Academic structure)."}
            </p>
          ) : (
            <ActionForm action={createCourse} submitLabel="Create course">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Code"><Input name="code" required placeholder="CS301" /></Field>
                <Field label="Credits"><Input name="credits" type="number" min={0} max={12} defaultValue={4} required /></Field>
              </div>
              <Field label="Title"><Input name="title" required maxLength={120} placeholder="Operating Systems" /></Field>
              <Field label="Department">
                <Select name="departmentId" required>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
              </Field>
              <Field label="Term" hint={terms.length ? "Linked terms allow enrolling whole class sections." : "Add terms under Academic structure to link courses to them."}>
                <Select name="termId" defaultValue="">
                  <option value="">Other (type below)</option>
                  {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </Select>
              </Field>
              <Field label="Term name (only if not linked)"><Input name="term" maxLength={40} placeholder="e.g. Spring 2027" /></Field>
              <Field label="Instructor">
                <Select name="instructorId" required>
                  {instructors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cover colour">
                  <Select name="color" defaultValue="indigo">{COURSE_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
                </Field>
                <Field label="Weekly sections" hint="Creates Week 1…N"><Input name="weeks" type="number" min={0} max={20} defaultValue={12} /></Field>
              </div>
              <Field label="Description (optional)"><Textarea name="description" rows={3} maxLength={2000} /></Field>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
