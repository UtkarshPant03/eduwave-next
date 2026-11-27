import { ClipboardCheck, ClipboardList, Download, FolderPlus, LayoutList, MessagesSquare, NotebookPen, Settings2, Upload, Users, Video } from "lucide-react";
import Link from "next/link";
import { addSection, updateCourseSettings } from "@/app/actions/instructor";
import { ActionForm } from "@/components/action-form";
import { EnrolPanel, LiveForm, ResourceForm } from "@/components/client/course-forms";
import { Tabs } from "@/components/client/tabs";
import { UnenrolButton } from "@/components/client/unenrol-button";
import { CourseHero } from "@/components/course/course-hero";
import { Discussions } from "@/components/course/discussions";
import { GradebookTable } from "@/components/course/gradebook-table";
import { CourseOutline } from "@/components/course/outline";
import { Avatar, buttonClass, Card, Empty, Field, Input, Table, Textarea } from "@/components/ui";
import { courseForInstructor } from "@/lib/access";
import { requireInstructor } from "@/lib/auth/dal";
import { COURSE_COLORS, coverFor } from "@/lib/course-colors";
import { courseOutline, courseParticipants, listSections } from "@/lib/data/courses";
import { gradebook } from "@/lib/data/gradebook";
import { db } from "@/db";
import { formatDate, formatRelative, requestTime } from "@/lib/format";
import { jitsiLink } from "@/lib/live";
import { ACCEPT_ATTR } from "@/lib/uploads";
import { routeIds } from "@/lib/route-ids";

export default async function InstructorCoursePage({ params }: PageProps<"/instructor/courses/[courseId]">) {
  const { courseId } = routeIds(await params);
  const user = await requireInstructor();
  const course = await courseForInstructor(user, courseId);
  const now = requestTime();
  const [outline, sections, participants, book, live] = await Promise.all([
    courseOutline(course.id),
    listSections(course.id),
    courseParticipants(course.id),
    gradebook(course.id),
    db.query.liveSessions.findMany({ where: (l, { eq }) => eq(l.courseId, course.id) }),
  ]);
  const liveLinks = Object.fromEntries(live.map((l) => [l.id, jitsiLink(l, user.name, now)]).filter(([, v]) => v)) as Record<string, string>;
  const label = (Icon: typeof Users, text: string, n?: number) => (
    <>
      <Icon className="size-4" /> {text} {n != null && <span className="rounded-full bg-surface-2 px-1.5 text-[11px] tabular-nums">{n}</span>}
    </>
  );

  return (
    <>
      <CourseHero
        course={course}
        students={participants.length}
        breadcrumbs={[{ label: "My courses", href: "/instructor/courses" }, { label: course.code }]}
        actions={
          <>
            <Link href={`/instructor/courses/${course.id}/assignments/new`} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:bg-white/90">
              <NotebookPen className="size-4" /> New assignment
            </Link>
            <Link href={`/instructor/courses/${course.id}/quizzes/new`} className="flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/25">
              <ClipboardList className="size-4" /> New quiz
            </Link>
          </>
        }
      />

      <Tabs
        tabs={[
          {
            id: "content",
            label: label(LayoutList, "Content"),
            content: (
              <div className="grid gap-6 xl:grid-cols-[1fr_24rem] [&>*]:min-w-0">
                <CourseOutline courseId={course.id} sections={outline} mode="instructor" now={now} liveLinks={liveLinks} />
                <div className="space-y-6">
                  <Card title="Add section" icon={<FolderPlus />}>
                    <ActionForm action={addSection} submitLabel="Add section">
                      <input type="hidden" name="courseId" value={course.id} />
                      <Field label="Title"><Input name="title" required maxLength={120} placeholder={`Week ${sections.length + 1}`} /></Field>
                      <Field label="Summary (optional)"><Input name="summary" maxLength={1000} /></Field>
                    </ActionForm>
                  </Card>
                  <Card title="Add material" icon={<Upload />}>
                    <ResourceForm courseId={course.id} sections={sections} accept={ACCEPT_ATTR} />
                  </Card>
                  <Card title="Schedule live class" icon={<Video />}>
                    <LiveForm courseId={course.id} sections={sections} />
                  </Card>
                </div>
              </div>
            ),
          },
          {
            id: "participants",
            label: label(Users, "Participants", participants.length),
            content: (
              <div className="grid gap-6 xl:grid-cols-[1fr_22rem] [&>*]:min-w-0">
                <Card title="Enrolled students">
                  {participants.length === 0 ? (
                    <Empty icon={<Users />}>No students yet. Enrol them, or share the enrolment key.</Empty>
                  ) : (
                    <Table head={["Student", "Programme", "Enrolled", "Last seen", ""]}>
                      {participants.map((p) => (
                        <tr key={p.id}>
                          <td className="px-2 py-2">
                            <span className="flex items-center gap-2">
                              <Avatar name={p.name} size="sm" />
                              <span>
                                {p.name}
                                <span className="block text-xs text-muted">{p.studentId} · {p.email}</span>
                              </span>
                            </span>
                          </td>
                          <td className="px-2 py-2 text-muted">{p.program ?? "–"}</td>
                          <td className="px-2 py-2 text-muted">{formatDate(p.enrolledAt)}</td>
                          <td className="px-2 py-2 text-muted">{p.lastLoginAt ? formatRelative(p.lastLoginAt, now) : "Never"}</td>
                          <td className="px-2 py-2 text-right"><UnenrolButton courseId={course.id} userId={p.id} name={p.name} /></td>
                        </tr>
                      ))}
                    </Table>
                  )}
                </Card>
                <div className="space-y-6">
                  <Card title="Enrol students" description="Paste student IDs or emails, one per line.">
                    <EnrolPanel courseId={course.id} />
                  </Card>
                  <Card title="Self-enrolment">
                    <p className="text-sm text-muted">
                      {course.enrollmentKey ? (
                        <>Students can join from the course catalogue with the key <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-foreground">{course.enrollmentKey}</code>. Change it in Settings.</>
                      ) : (
                        "Self-enrolment is closed. Set an enrolment key in Settings to let students join from the catalogue."
                      )}
                    </p>
                  </Card>
                </div>
              </div>
            ),
          },
          {
            id: "gradebook",
            label: label(ClipboardCheck, "Gradebook"),
            content: (
              <Card
                title="Gradebook"
                description="Missing work after the deadline counts as 0; ungraded submissions don't count yet."
                action={<a href={`/instructor/courses/${course.id}/gradebook/export`} className={buttonClass("secondary", "sm")}><Download className="size-3.5" /> Export CSV</a>}
              >
                <GradebookTable book={book} />
              </Card>
            ),
          },
          { id: "discussions", label: label(MessagesSquare, "Discussions"), content: <Discussions courseId={course.id} role="instructor" now={now} /> },
          {
            id: "settings",
            label: label(Settings2, "Settings"),
            content: (
              <Card title="Course settings" className="max-w-2xl">
                <ActionForm action={updateCourseSettings} submitLabel="Save settings">
                  <input type="hidden" name="courseId" value={course.id} />
                  <Field label="Title"><Input name="title" defaultValue={course.title} required minLength={3} maxLength={120} /></Field>
                  <Field label="Description" hint="Shown in the course catalogue.">
                    <Textarea name="description" defaultValue={course.description ?? ""} rows={4} maxLength={4000} />
                  </Field>
                  <Field label="Enrolment key" hint="At least 6 characters. Leave blank to close self-enrolment.">
                    <Input name="enrollmentKey" defaultValue={course.enrollmentKey ?? ""} maxLength={40} autoComplete="off" />
                  </Field>
                  <fieldset>
                    <legend className="mb-2 text-sm font-medium">Cover colour</legend>
                    <div className="flex flex-wrap gap-2">
                      {COURSE_COLORS.map((c) => (
                        <label key={c} className="cursor-pointer">
                          <input type="radio" name="color" value={c} defaultChecked={course.color === c} className="peer sr-only" />
                          <span
                            className="block size-9 rounded-xl ring-offset-2 ring-offset-surface transition peer-checked:ring-2 peer-checked:ring-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
                            style={{ background: `linear-gradient(135deg, ${coverFor(c).from}, ${coverFor(c).to})` }}
                            title={c}
                          />
                          <span className="sr-only">{c}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="published" defaultChecked={course.published} className="size-4 accent-[var(--accent)]" /> Visible to students
                  </label>
                </ActionForm>
              </Card>
            ),
          },
        ]}
      />
    </>
  );
}
