import { CalendarCheck, ClipboardCheck, ClipboardList, Download, FolderPlus, LayoutList, Library, MessagesSquare, NotebookPen, PenLine, Settings2, SlidersHorizontal, Upload, Users, Video } from "lucide-react";
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
import { Badge, Avatar, buttonClass, Card, Empty, Field, Input, Table, Textarea, Select } from "@/components/ui";
import { courseForInstructor, courseStaffRole } from "@/lib/access";
import { STAFF_ROLE_LABEL, staffCan } from "@/lib/auth/capabilities";
import { InstructorAttendancePanel } from "@/components/course/attendance-panel";
import { addCourseStaff } from "@/app/actions/institution";
import { StaffActions } from "@/components/client/course-admin";
import { requireInstructor } from "@/lib/auth/dal";
import { COURSE_COLORS, coverFor } from "@/lib/course-colors";
import { courseOutline, courseParticipants, listSections, courseStaffList } from "@/lib/data/courses";
import { gradebook } from "@/lib/data/gradebook";
import { db } from "@/db";
import { formatDate, formatRelative, requestTime } from "@/lib/format";
import { jitsiLink } from "@/lib/live";
import { ACCEPT_ATTR } from "@/lib/uploads";
import { routeIds } from "@/lib/route-ids";

export default async function InstructorCoursePage({ params }: PageProps<"/instructor/courses/[courseId]">) {
  const { courseId } = routeIds(await params);
  const user = await requireInstructor();
  const course = await courseForInstructor(user, courseId, "course.view");
  // Teaching assistants can view, grade and moderate, but not change the course.
  const myRole = await courseStaffRole(user.id, course.id);
  const canManage = user.role === "admin" || staffCan(myRole, "course.manage");
  // Coordinators decide who teaches the course (the primary instructor is changed by department managers).
  const canManageStaff = user.role === "admin" || staffCan(myRole, "staff.manage");
  const canMarkAttendance = user.role === "admin" || staffCan(myRole, "attendance.mark");
  const canApproveAttendance = user.role === "admin" || staffCan(myRole, "attendance.approve");
  const canEditGrades = user.role === "admin" || staffCan(myRole, "grade.edit");
  const now = requestTime();
  const [outline, sections, participants, book, live, staff] = await Promise.all([
    courseOutline(course.id),
    listSections(course.id),
    courseParticipants(course.id),
    gradebook(course.id, { audience: "staff" }),
    db.query.liveSessions.findMany({ where: (l, { eq }) => eq(l.courseId, course.id) }),
    courseStaffList(course.id),
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
            {canManage && (
              <>
                <Link href={`/instructor/courses/${course.id}/assignments/new`} className={buttonClass()}>
                  <NotebookPen className="size-4" /> New assignment
                </Link>
                <Link href={`/instructor/courses/${course.id}/quizzes/new`} className={buttonClass("secondary")}>
                  <ClipboardList className="size-4" /> New quiz
                </Link>
              </>
            )}
            <Link href={`/instructor/courses/${course.id}/bank`} className={buttonClass("secondary")}>
              <Library className="size-4" /> Question bank
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
                <CourseOutline courseId={course.id} sections={outline} mode="instructor" canManage={canManage} now={now} liveLinks={liveLinks} />
                {canManage && (
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
                )}
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
                          <td className="px-2 py-2 text-right">{canManage && <UnenrolButton courseId={course.id} userId={p.id} name={p.name} />}</td>
                        </tr>
                      ))}
                    </Table>
                  )}
                </Card>
                <div className="space-y-6">
                  <Card title="Course staff">
                    <ul className="space-y-2 text-sm">
                      {staff.map((m) => (
                        <li key={m.userId} className="flex items-center justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{m.name}</span>
                            <span className="block truncate text-xs text-muted">{m.email}</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Badge>{m.primary ? "Primary instructor" : STAFF_ROLE_LABEL[m.role]}</Badge>
                            {canManageStaff && <StaffActions courseId={course.id} userId={m.userId} name={m.name} primary={m.primary} canBePrimary={false} />}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {canManageStaff && (
                      <div className="mt-4 border-t border-border pt-4">
                        <ActionForm action={addCourseStaff} submitLabel="Add to staff">
                          <input type="hidden" name="courseId" value={course.id} />
                          <Field label="Instructor's email"><Input name="email" type="email" required /></Field>
                          <Field label="Role">
                            <Select name="role" defaultValue="teaching_assistant">
                              <option value="teaching_assistant">Teaching assistant</option>
                              <option value="instructor">Instructor</option>
                              <option value="coordinator">Course coordinator</option>
                            </Select>
                          </Field>
                        </ActionForm>
                      </div>
                    )}
                  </Card>
                  {canManage && (
                  <>
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
                  </>
                  )}
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
                description={
                  book.method === "weighted"
                    ? "Missing work after the deadline counts as 0; ungraded submissions don't count yet. Weighted total: each category's percentage times its weight, re-scaled over the categories that have counted work."
                    : "Missing work after the deadline counts as 0; ungraded submissions don't count yet."
                }
                action={
                  <span className="flex flex-wrap justify-end gap-2">
                    {canManage && (
                      <Link href={`/instructor/courses/${course.id}/gradebook/setup`} className={buttonClass("secondary", "sm")}><SlidersHorizontal className="size-3.5" /> Gradebook setup</Link>
                    )}
                    {canEditGrades && (
                      <Link href={`/instructor/courses/${course.id}/gradebook/overrides`} className={buttonClass("secondary", "sm")}><PenLine className="size-3.5" /> Overrides</Link>
                    )}
                    <a href={`/instructor/courses/${course.id}/gradebook/export`} className={buttonClass("secondary", "sm")}><Download className="size-3.5" /> Export CSV</a>
                  </span>
                }
              >
                <GradebookTable book={book} />
              </Card>
            ),
          },
          { id: "discussions", label: label(MessagesSquare, "Discussions"), content: <Discussions courseId={course.id} role="instructor" now={now} /> },
          ...(canMarkAttendance
            ? [{ id: "attendance", label: label(CalendarCheck, "Attendance"), content: <InstructorAttendancePanel course={course} canManage={canManage} canApprove={canApproveAttendance} /> }]
            : []),
          ...(canManage ? [{
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
                            className="block size-9 rounded-lg ring-offset-2 ring-offset-surface transition peer-checked:ring-2 peer-checked:ring-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
                            style={{ background: coverFor(c).from }}
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
          }] : []),
        ]}
      />
    </>
  );
}
