import type { Metadata } from "next";
import { Building2, CalendarRange, GraduationCap, Layers, Users } from "lucide-react";
import {
  assignStudentsToSection,
  createBatch,
  createClassSection,
  createDepartment,
  createProgramme,
  createSession,
  createTerm,
} from "@/app/actions/institution";
import { ActionForm } from "@/components/action-form";
import { Card, Empty, Field, Input, PageHeader, Select, Table, Textarea } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/dal";
import { listBatches, listClassSections, listDepartments, listProgrammes, listSessions, listTerms } from "@/lib/data/institution";

export const metadata: Metadata = { title: "Academic structure" };

/**
 * The university's academic structure as data: departments → programmes → batches →
 * class sections, and sessions → terms. Nothing here is hard-coded; routine changes
 * (a new programme, batch or section) need no code change.
 */
export default async function StructurePage() {
  await requireAdmin();
  const [departments, programmes, sessions, terms, batches, sections] = await Promise.all([
    listDepartments(),
    listProgrammes(),
    listSessions(),
    listTerms(),
    listBatches(),
    listClassSections(),
  ]);
  const hint = (t: string) => <p className="text-sm text-muted">{t}</p>;

  return (
    <>
      <PageHeader eyebrow="Manage" title="Academic structure" subtitle="Departments, programmes, terms, batches and class sections." />
      <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        <Card title="Departments" icon={<Building2 />}>
          {departments.length === 0 ? <Empty>No departments yet.</Empty> : (
            <Table head={["Department", "Code", "Programmes", "Courses"]}>
              {departments.map((d) => (
                <tr key={d.id}>
                  <td className="py-2">{d.name}</td>
                  <td className="py-2 font-mono text-xs">{d.code ?? "–"}</td>
                  <td className="py-2 tabular-nums">{d.programmes}</td>
                  <td className="py-2 tabular-nums">{d.courses}</td>
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

        <Card title="Programmes" icon={<GraduationCap />}>
          {programmes.length === 0 ? <Empty>No programmes yet.</Empty> : (
            <Table head={["Programme", "Department", "Semesters"]}>
              {programmes.map((p) => (
                <tr key={p.id}>
                  <td className="py-2">{p.name}{p.code && <span className="ml-2 font-mono text-xs text-muted">{p.code}</span>}</td>
                  <td className="py-2 text-muted">{p.department}</td>
                  <td className="py-2 tabular-nums">{p.semesters}</td>
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

        <Card title="Academic sessions and terms" icon={<CalendarRange />}>
          {terms.length === 0 ? <Empty>No terms yet.</Empty> : (
            <Table head={["Term", "Starts", "Ends"]}>
              {terms.map((t) => (
                <tr key={t.id}>
                  <td className="py-2">{t.label}</td>
                  <td className="py-2 tabular-nums text-muted">{t.startsOn}</td>
                  <td className="py-2 tabular-nums text-muted">{t.endsOn}</td>
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

        <Card title="Batches and class sections" icon={<Layers />}>
          {sections.length === 0 ? <Empty>No class sections yet.</Empty> : (
            <Table head={["Section", "Placements"]}>
              {sections.map((s) => (
                <tr key={s.id}>
                  <td className="py-2">{s.label}</td>
                  <td className="py-2 tabular-nums">{s.members}</td>
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

        <Card title="Place students in a section" icon={<Users />} description="Membership is recorded per term, so a student can change section between terms." className="xl:col-span-2">
          {sections.length === 0 || terms.length === 0 ? hint("Add at least one term and one class section first.") : (
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
      </div>
    </>
  );
}
