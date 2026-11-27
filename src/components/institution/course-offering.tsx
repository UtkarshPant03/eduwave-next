import { notFound } from "next/navigation";
import { GraduationCap, Layers, Link2, UserPlus } from "lucide-react";
import { addCourseStaff, linkCourseSection, updateCourseAcademic } from "@/app/actions/institution";
import { ActionForm } from "@/components/action-form";
import { EnrolSectionsButton, StaffActions, UnlinkSectionButton } from "@/components/client/course-admin";
import { Badge, Card, Empty, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { STAFF_ROLE_LABEL } from "@/lib/auth/capabilities";
import { courseStaffList } from "@/lib/data/courses";
import { courseForAdmin, courseSectionLinks, listClassSections, listDepartments, listTerms } from "@/lib/data/institution";

/**
 * A course offering's academic links, staff and class sections. Used by administrators
 * (`only` undefined: all departments) and by department managers (`only` = their
 * department): lists are filtered to what the viewer may use, and the server actions
 * enforce the same rules.
 */
export async function CourseOfferingView({ courseId, only, breadcrumbs }: { courseId: string; only?: string[]; breadcrumbs: { label: string; href?: string }[] }) {
  const row = await courseForAdmin(courseId);
  if (!row) notFound();
  const { course } = row;
  const [staff, links, departments, terms, sections] = await Promise.all([
    courseStaffList(course.id),
    courseSectionLinks(course.id, course.termId),
    listDepartments(only),
    listTerms(),
    listClassSections(only),
  ]);
  const linked = new Set(links.map((l) => l.sectionId));

  return (
    <>
      <PageHeader
        breadcrumbs={[...breadcrumbs, { label: course.code }]}
        title={`${course.code} · ${course.title}`}
        subtitle={`${row.department ?? course.department} · ${row.term ?? course.term}${course.published ? "" : " · hidden from students"}`}
      />
      <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        <Card title="Academic details" icon={<Layers />} description="Link the offering to the university's structure. Section enrolment needs a term.">
          <ActionForm action={updateCourseAcademic} submitLabel="Save">
            <input type="hidden" name="courseId" value={course.id} />
            <Field label="Department">
              <Select name="departmentId" defaultValue={course.departmentId ?? ""} required>
                <option value="" disabled>Choose…</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <Field label="Term" hint={course.termId ? undefined : `Currently "${course.term}" (not linked).`}>
              <Select name="termId" defaultValue={course.termId ?? ""}>
                <option value="">Not linked</option>
                {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </Select>
            </Field>
          </ActionForm>
        </Card>

        <Card title="Course staff" icon={<GraduationCap />} description="Teaching assistants can grade and moderate discussions, but can't change the course.">
          <Table head={["Name", "Role", ""]}>
            {staff.map((m) => (
              <tr key={m.userId}>
                <td className="py-2">{m.name}<span className="block text-xs text-muted">{m.email}</span></td>
                <td className="py-2"><Badge tone={m.primary ? "accent" : "neutral"}>{m.primary ? "Primary instructor" : STAFF_ROLE_LABEL[m.role]}</Badge></td>
                <td className="py-2 text-right">
                  <StaffActions courseId={course.id} userId={m.userId} name={m.name} primary={m.primary} canBePrimary={m.role !== "teaching_assistant"} />
                </td>
              </tr>
            ))}
          </Table>
          <div className="mt-4 border-t border-border pt-4">
            <ActionForm action={addCourseStaff} submitLabel="Add to staff" className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
              <input type="hidden" name="courseId" value={course.id} />
              <Field label="Instructor's email"><Input name="email" type="email" required placeholder="name@university.edu" /></Field>
              <Field label="Role">
                <Select name="role" defaultValue="instructor">
                  <option value="instructor">Instructor</option>
                  <option value="coordinator">Course coordinator</option>
                  <option value="teaching_assistant">Teaching assistant</option>
                </Select>
              </Field>
            </ActionForm>
          </div>
        </Card>

        <Card title="Class sections" icon={<Link2 />} description="Which sections take this course. Linking doesn't enrol anyone until you press Enrol.">
          {links.length === 0 ? (
            <Empty icon={<UserPlus />}>No sections linked yet.</Empty>
          ) : (
            <Table head={["Section", course.termId ? "Students this term" : "Students", ""]}>
              {links.map((l) => (
                <tr key={l.sectionId}>
                  <td className="py-2">{l.label}</td>
                  <td className="py-2 tabular-nums">{course.termId ? l.members : "–"}</td>
                  <td className="py-2 text-right"><UnlinkSectionButton courseId={course.id} sectionId={l.sectionId} label={l.label} /></td>
                </tr>
              ))}
            </Table>
          )}
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            {sections.some((s) => !linked.has(s.id)) && (
              <ActionForm action={linkCourseSection} submitLabel="Link section" className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <input type="hidden" name="courseId" value={course.id} />
                <Field label="Section">
                  <Select name="sectionId" required>
                    {sections.filter((s) => !linked.has(s.id)).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </Select>
                </Field>
              </ActionForm>
            )}
            <EnrolSectionsButton
              courseId={course.id}
              disabledReason={!course.termId ? "Link the course to a term first." : links.length === 0 ? "Link at least one section first." : undefined}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
