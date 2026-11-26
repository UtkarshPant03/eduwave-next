"use client";

import { Download, KeyRound, Search, Trash2, Upload, UserPlus, Users } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { addStudent, importStudents, removeStudent, resetStudentPassword, type ImportResult } from "@/app/actions/teacher";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Empty, Field, Input, Table, Textarea } from "@/components/ui";
import { CopyButton } from "./copy-button";
import { Dialog } from "./dialog";

type Student = {
  id: string;
  name: string;
  rollNumber: string | null;
  email: string | null;
  mustChangePassword: boolean;
  quizzesTaken: number;
  averagePercent: number | null;
};

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export function StudentsPanel({ classId, className, students }: { classId: string; className: string; students: Student[] }) {
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<"add" | "import" | null>(null);
  const [reset, setReset] = useState<{ name: string; password: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? students.filter((s) => s.name.toLowerCase().includes(q) || s.rollNumber?.toLowerCase().includes(q)) : students;
  }, [query, students]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or roll number" className="pl-9" aria-label="Search students" />
        </div>
        <Button variant="secondary" onClick={() => setDialog("import")}><Upload className="size-4" /> Import CSV</Button>
        <Button onClick={() => setDialog("add")}><UserPlus className="size-4" /> Add student</Button>
      </div>

      {students.length === 0 ? (
        <Empty icon={<Users />}>No students yet. Add them one by one or import a CSV.</Empty>
      ) : (
        <Table head={["Roll no.", "Name", "Quizzes", "Average", "Status", ""]}>
          {filtered.map((s) => (
            <tr key={s.id} className="group">
              <td className="px-2 py-2 font-mono text-xs text-muted">{s.rollNumber}</td>
              <td className="px-2 py-2">
                {s.name}
                {s.email && <span className="block text-xs text-muted">{s.email}</span>}
              </td>
              <td className="px-2 py-2 tabular-nums">{s.quizzesTaken}</td>
              <td className="px-2 py-2 tabular-nums">{s.averagePercent == null ? "–" : `${Math.round(s.averagePercent)}%`}</td>
              <td className="px-2 py-2">{s.mustChangePassword ? <Badge tone="warning">Temp password</Badge> : <Badge tone="success">Active</Badge>}</td>
              <td className="px-2 py-2">
                <div className="flex justify-end gap-1">
                  <button
                    title="Reset password"
                    aria-label={`Reset password for ${s.name}`}
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        if (!confirm(`Reset ${s.name}'s password? They will be signed out everywhere.`)) return;
                        const res = await resetStudentPassword(classId, s.id);
                        if (res.password) setReset({ name: s.name, password: res.password });
                        else toast.error(res.error ?? "Reset failed.");
                      })
                    }
                    className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
                  >
                    <KeyRound className="size-4" />
                  </button>
                  <button
                    title="Remove student"
                    aria-label={`Remove ${s.name}`}
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        if (!confirm(`Remove ${s.name}? Their quiz attempts will be deleted too.`)) return;
                        const fd = new FormData();
                        fd.set("classId", classId);
                        fd.set("studentId", s.id);
                        await removeStudent(fd);
                        toast.success(`Removed ${s.name}.`);
                      })
                    }
                    className="grid size-8 place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6} className="px-2 py-6 text-center text-sm text-muted">No students match “{query}”.</td>
            </tr>
          )}
        </Table>
      )}

      <Dialog open={dialog === "add"} onClose={() => setDialog(null)} title={`Add student to ${className}`}>
        <ActionForm action={addStudent} submitLabel="Add student" persistentSuccess>
          <input type="hidden" name="classId" value={classId} />
          <Field label="Full name"><Input name="name" required autoFocus /></Field>
          <Field label="Roll number"><Input name="rollNumber" required pattern="[A-Za-z0-9\-]{2,20}" /></Field>
          <Field label="Email (optional)" hint="Used for quiz and class notifications if email is enabled.">
            <Input name="email" type="email" />
          </Field>
          <p className="text-xs text-muted">A temporary password is generated for you to hand over. The student must change it at first login.</p>
        </ActionForm>
      </Dialog>

      <Dialog open={dialog === "import"} onClose={() => setDialog(null)} title="Import students from CSV" wide>
        <ImportForm classId={classId} />
      </Dialog>

      <Dialog open={reset !== null} onClose={() => setReset(null)} title="Password reset">
        {reset && (
          <div className="space-y-3 text-sm">
            <p>New temporary password for <strong>{reset.name}</strong>:</p>
            <p className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 font-mono text-base">
              {reset.password} <CopyButton text={reset.password} />
            </p>
            <p className="text-muted">Shown once. They&apos;ve been signed out of all devices and must choose a new password when they log in.</p>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function ImportForm({ classId }: { classId: string }) {
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (result) {
    return (
      <div className="space-y-4 text-sm">
        <p>
          <strong>{result.created.length}</strong> student(s) created
          {result.errors.length > 0 && <>, <strong className="text-danger">{result.errors.length}</strong> row(s) skipped</>}.
        </p>
        {result.created.length > 0 && (
          <>
            <Button
              onClick={() =>
                downloadCsv("student-logins.csv", [["name", "rollNumber", "temporaryPassword"], ...result.created.map((c) => [c.name, c.rollNumber, c.password])])
              }
            >
              <Download className="size-4" /> Download login slips (CSV)
            </Button>
            <p className="text-xs text-muted">Passwords are shown only now. Download them before closing; each student must change theirs at first login.</p>
          </>
        )}
        {result.errors.length > 0 && (
          <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-danger">
            {result.errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Columns: <code>name</code>, <code>rollNumber</code>, and optionally <code>email</code>. First row must be the header.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) setCsv(await f.text());
        }}
        className="text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm"
      />
      <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={8} placeholder={"name,rollNumber,email\nAarav Sharma,S010,aarav@example.com\nDiya Negi,S011,"} className="font-mono text-xs" />
      <Button disabled={pending || !csv.trim()} onClick={() => startTransition(async () => setResult(await importStudents(classId, csv)))}>
        {pending ? "Importing…" : "Import"}
      </Button>
    </div>
  );
}
