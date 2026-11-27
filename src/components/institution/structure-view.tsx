import Link from "next/link";
import { BookOpen, Building2, CalendarRange, GraduationCap, Layers, ShieldCheck, Users } from "lucide-react";
import {
  assignDepartmentRole,
  assignStudentsToSection,
  createBatch,
  createClassSection,
  createDepartment,
  createProgramme,
  createSession,
  createTerm,
  renameBatch,
  renameClassSection,
  updateDepartment,
  updateProgramme,
  updateTerm,
} from "@/app/actions/institution";
import { ActionForm } from "@/components/action-form";
import { RemoveRoleButton } from "@/components/client/course-admin";
import { Badge, Card, Empty, Field, Input, Select, Table, Textarea } from "@/components/ui";
import { DEPARTMENT_ROLE_LABEL } from "@/lib/auth/scope";
import {
  departmentCourses,
  listBatches,
  listClassSections,
  listDepartmentRoles,
  listDepartments,
  listProgrammes,
  listSessions,
  listTerms,
} from "@/lib/data/institution";

/** Inline "Edit" disclosure for one table row (works without JavaScript). */
function EditRow({ children }: { children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-sm text-accent hover:underline [&::-webkit-details-marker]:hidden">Edit</summary>
      <div className="mt-2 min-w-64 rounded-lg border border-border bg-surface p-3">{children}</div>
    </details>
  );
}

/**
 * The academic structure, for administrators (`scope="all"`) or for the managers of one
 * department (`scope={{ departmentId }}`): the same view, filtered, with institution-wide
 * items (departments, sessions/terms, department roles) only for administrators.
 * The actions enforce the same scoping on the server.
 */
export async function StructureView({ scope }: { scope: "all" | { departmentId: string } }) {
  const only = scope === "all" ? undefined : [scope.departmentId];
  const admin = scope === "all";
  const [departments, programmes, sessions, terms, batches, sections, roles, courses] = await Promise.all([
    listDepartments(only),
    listProgrammes(only),
    listSessions(),
    listTerms(),
    listBatches(only),
    listClassSections(only),
    admin ? listDepartmentRoles() : Promise.resolve([]),
    admin ? Promise.resolve([]) : departmentCourses(scope.departmentId),
  ]);
  const hint = (t: string) => <p className="text-sm text-muted">{t}</p>;

  return (
    <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
      {admin ? (
        <Card title="Departments" icon={<Building2 />}>
          {departments.length === 0 ? <Empty>No departments yet.</Empty> : (
            <Table head={["Department", "Code", "Programmes", "Courses", ""]}>
              {departments.map((d) => (
                <tr key={d.id}>
                  <td className="py-2">{d.name} {!d.active && <Badge tone="warning">Inactive</Badge>}</td>
                  <td className="py-2 font-mono text-xs">{d.code ?? "–"}</td>
                  <td className="py-2 tabular-nums">{d.programmes}</td>
                  <td className="py-2 tabular-nums">{d.courses}</td>
                  <td className="py-2">
                    <EditRow>
                      <ActionForm action={updateDepartment} submitLabel="Save">
                        <input type="hidden" name="id" value={d.id} />
                        <Field label="Name"><Input name="name" defaultValue={d.name} required maxLength={120} /></Field>
                        <Field label="Code"><Input name="code" defaultValue={d.code ?? ""} maxLength={12} /></Field>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={d.active} className="size-4" /> Active</label>
                      </ActionForm>
                    </EditRow>
                  </td>
                </tr>
              ))}
            </Table>
          )}
          <div className="mt-4 border-t border-border pt-4">
            <ActionForm action={createDepartment} submitLabel="Add department" className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
              <Field label="Name"><Input name="name" required maxLength={120} /></Field>
              <Field label="Code (optional)"><Input name="code" maxLength={12} /></Field>
            </ActionForm>
          </div>
        </Card>
      ) : (
        <Card title="Course offerings" icon={<BookOpen />} description="Courses in this department: manage their staff and class sections.">
          {courses.length === 0 ? <Empty>No courses in this department yet. Administrators create courses.</Empty> : (
            <Table head={["Course", "Term", ""]}>
              {courses.map((c) => (
                <tr key={c.id}>
                  <td className="py-2">
                    <Link href={`/instructor/department/${scope.departmentId}/courses/${c.id}`} className="font-medium hover:underline">{c.code}</Link>
                    <span className="block text-xs text-muted">{c.title}</span>
                  </td>
                  <td className="py-2 text-muted">{c.term}</td>
                  <td className="py-2">{!c.published && <Badge tone="warning">Hidden</Badge>}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      <Card title="Programmes" icon={<GraduationCap />}>
        {programmes.length === 0 ? <Empty>No programmes yet.</Empty> : (
          <Table head={["Programme", ...(admin ? ["Department"] : []), "Semesters", ""]}>
            {programmes.map((p) => (
              <tr key={p.id}>
                <td className="py-2">{p.name}{p.code && <span className="ml-2 font-mono text-xs text-muted">{p.code}</span>} {!p.active && <Badge tone="warning">Inactive</Badge>}</td>
                {admin && <td className="py-2 text-muted">{p.department}</td>}
                <td className="py-2 tabular-nums">{p.semesters}</td>
                <td className="py-2">
                  <EditRow>
                    <ActionForm action={updateProgramme} submitLabel="Save">
                      <input type="hidden" name="id" value={p.id} />
                      <Field label="Name"><Input name="name" defaultValue={p.name} required maxLength={120} /></Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Code"><Input name="code" defaultValue={p.code ?? ""} maxLength={20} /></Field>
                        <Field label="Semesters"><Input name="semesters" type="number" min={1} max={16} defaultValue={p.semesters} required /></Field>
                      </div>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p.active} className="size-4" /> Active</label>
                    </ActionForm>
                  </EditRow>
                </td>
              </tr>
            ))}
          </Table>
        )}
        <div className="mt-4 border-t border-border pt-4">
          {departments.length === 0 ? hint("Add a department first.") : (
            <ActionForm action={createProgramme} submitLabel="Add programme">
              <Field label="Department">
                <Select name="departmentId" required>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-[1fr_8rem_7rem]">
                <Field label="Name"><Input name="name" required maxLength={120} placeholder="e.g. B.Tech Computer Science and Engineering" /></Field>
                <Field label="Code"><Input name="code" maxLength={20} /></Field>
                <Field label="Semesters"><Input name="semesters" type="number" min={1} max={16} required /></Field>
              </div>
            </ActionForm>
          )}
        </div>
      </Card>

      {admin && (
        <Card title="Academic sessions and terms" icon={<CalendarRange />}>
          {terms.length === 0 ? <Empty>No terms yet.</Empty> : (
            <Table head={["Term", "Starts", "Ends", ""]}>
              {terms.map((t) => (
                <tr key={t.id}>
                  <td className="py-2">{t.label}</td>
                  <td className="py-2 tabular-nums text-muted">{t.startsOn}</td>
                  <td className="py-2 tabular-nums text-muted">{t.endsOn}</td>
                  <td className="py-2">
                    <EditRow>
                      <ActionForm action={updateTerm} submitLabel="Save">
                        <input type="hidden" name="id" value={t.id} />
                        <Field label="Term name"><Input name="name" defaultValue={t.name} required maxLength={40} /></Field>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Starts"><Input name="startsOn" type="date" defaultValue={t.startsOn} required /></Field>
                          <Field label="Ends"><Input name="endsOn" type="date" defaultValue={t.endsOn} required /></Field>
                        </div>
                      </ActionForm>
                    </EditRow>
                  </td>
                </tr>
              ))}
            </Table>
          )}
          <div className="mt-4 grid gap-6 border-t border-border pt-4 lg:grid-cols-2">
            <ActionForm action={createSession} submitLabel="Add session">
              <Field label="Session name"><Input name="name" required maxLength={40} placeholder="e.g. 2026–27" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Starts"><Input name="startsOn" type="date" required /></Field>
                <Field label="Ends"><Input name="endsOn" type="date" required /></Field>
              </div>
            </ActionForm>
            {sessions.length === 0 ? hint("Add a session to create its terms.") : (
              <ActionForm action={createTerm} submitLabel="Add term">
                <Field label="Session">
                  <Select name="sessionId" required>{sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
                </Field>
                <Field label="Term name"><Input name="name" required maxLength={40} placeholder="e.g. Odd semester" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Starts"><Input name="startsOn" type="date" required /></Field>
                  <Field label="Ends"><Input name="endsOn" type="date" required /></Field>
                </div>
              </ActionForm>
            )}
          </div>
        </Card>
      )}

      <Card title="Batches and class sections" icon={<Layers />}>
        {batches.length === 0 && sections.length === 0 ? <Empty>No batches yet.</Empty> : (
          <Table head={["Batch / section", "Placements", ""]}>
            {batches.map((b) => (
              <tr key={b.id}>
                <td className="py-2 font-medium">{b.name}<span className="block text-xs font-normal text-muted">{b.programme} · intake {b.intakeYear}</span></td>
                <td />
                <td className="py-2">
                  <EditRow>
                    <ActionForm action={renameBatch} submitLabel="Save">
                      <input type="hidden" name="id" value={b.id} />
                      <Field label="Batch name"><Input name="name" defaultValue={b.name} required maxLength={120} /></Field>
                    </ActionForm>
                  </EditRow>
                </td>
              </tr>
            ))}
            {sections.map((s) => (
              <tr key={s.id}>
                <td className="py-2 pl-6">{s.label}</td>
                <td className="py-2 tabular-nums">{s.members}</td>
                <td className="py-2">
                  <EditRow>
                    <ActionForm action={renameClassSection} submitLabel="Save">
                      <input type="hidden" name="id" value={s.id} />
                      <Field label="Section name"><Input name="name" defaultValue={s.name} required maxLength={20} /></Field>
                    </ActionForm>
                  </EditRow>
                </td>
              </tr>
            ))}
          </Table>
        )}
        <div className="mt-4 grid gap-6 border-t border-border pt-4 lg:grid-cols-2">
          {programmes.length === 0 ? hint("Add a programme first.") : (
            <ActionForm action={createBatch} submitLabel="Add batch">
              <Field label="Programme">
                <Select name="programmeId" required>{programmes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
              </Field>
              <div className="grid grid-cols-[7rem_1fr] gap-3">
                <Field label="Intake year"><Input name="intakeYear" type="number" min={1990} max={2200} required /></Field>
                <Field label="Batch name"><Input name="name" required maxLength={120} placeholder="e.g. B.Tech CSE 2024" /></Field>
              </div>
            </ActionForm>
          )}
          {batches.length === 0 ? hint("Add a batch to create its sections.") : (
            <ActionForm action={createClassSection} submitLabel="Add section">
              <Field label="Batch">
                <Select name="batchId" required>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
              </Field>
              <Field label="Section name"><Input name="name" required maxLength={20} placeholder="e.g. A" /></Field>
            </ActionForm>
          )}
        </div>
      </Card>

      <Card title="Place students in a section" icon={<Users />} description="Membership is recorded per term, so a student can change section between terms." className={admin ? "" : "xl:col-span-2"}>
        {sections.length === 0 || terms.length === 0 ? hint("Needs at least one term and one class section.") : (
          <ActionForm action={assignStudentsToSection} submitLabel="Place students" className="grid gap-3 lg:grid-cols-[1fr_1fr_2fr] lg:items-start">
            <Field label="Term">
              <Select name="termId" required>{terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select>
            </Field>
            <Field label="Section">
              <Select name="sectionId" required>{sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
            </Field>
            <Field label="Students" hint="Student IDs or emails, separated by spaces, commas or new lines.">
              <Textarea name="students" rows={3} required />
            </Field>
          </ActionForm>
        )}
      </Card>

      {admin && (
        <Card title="Department roles" icon={<ShieldCheck />} description="Department administrators, HODs and deans manage only their own department's structure and course offerings." className="xl:col-span-2">
          {roles.length === 0 ? <Empty>No department roles assigned yet.</Empty> : (
            <Table head={["Person", "Role", "Department", ""]}>
              {roles.map((r) => (
                <tr key={r.id}>
                  <td className="py-2">{r.user}<span className="block text-xs text-muted">{r.email}</span></td>
                  <td className="py-2"><Badge>{DEPARTMENT_ROLE_LABEL[r.role]}</Badge></td>
                  <td className="py-2 text-muted">{r.department}</td>
                  <td className="py-2 text-right"><RemoveRoleButton id={r.id} label={`${DEPARTMENT_ROLE_LABEL[r.role]} role of ${r.user}`} /></td>
                </tr>
              ))}
            </Table>
          )}
          {departments.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <ActionForm action={assignDepartmentRole} submitLabel="Assign role" className="grid gap-3 lg:grid-cols-[1fr_12rem_1fr_auto] lg:items-end">
                <Field label="Staff member's email"><Input name="email" type="email" required /></Field>
                <Field label="Department role">
                  <Select name="role" defaultValue="department_admin">
                    {Object.entries(DEPARTMENT_ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </Select>
                </Field>
                <Field label="In department">
                  <Select name="departmentId" required>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
                </Field>
              </ActionForm>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
