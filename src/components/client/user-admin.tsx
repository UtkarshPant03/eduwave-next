"use client";

import { Download, KeyRound, Power, Upload, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createUser, importUsers, resetUserPassword, setUserActive, type ImportResult } from "@/app/actions/admin";
import { ActionForm } from "@/components/action-form";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { CopyButton } from "./copy-button";
import { Dialog } from "./dialog";

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

export function UserAdminToolbar() {
  const [dialog, setDialog] = useState<"create" | "import" | null>(null);
  const [role, setRole] = useState("student");
  return (
    <>
      <Button variant="secondary" onClick={() => setDialog("import")}><Upload className="size-4" /> Import CSV</Button>
      <Button onClick={() => setDialog("create")}><UserPlus className="size-4" /> New user</Button>

      <Dialog open={dialog === "create"} onClose={() => setDialog(null)} title="Create user">
        <ActionForm action={createUser} submitLabel="Create account" persistentSuccess>
          <Field label="Role">
            <Select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="student">Student</option>
              <option value="instructor">Instructor</option>
              <option value="admin">Administrator</option>
            </Select>
          </Field>
          <Field label="Full name"><Input name="name" required maxLength={100} /></Field>
          <Field label="Email"><Input name="email" type="email" required /></Field>
          {role === "student" && <Field label="Student ID"><Input name="studentId" required pattern="[A-Za-z0-9\-]{3,20}" placeholder="22CS1043" /></Field>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Department"><Input name="department" maxLength={100} placeholder="Computer Science" /></Field>
            <Field label={role === "student" ? "Programme" : "Title"}><Input name="program" maxLength={100} placeholder={role === "student" ? "B.Tech CSE, Year 2" : "Assistant Professor"} /></Field>
          </div>
          <p className="text-xs text-muted">A temporary password is generated and shown once. The user must change it at first sign-in.</p>
        </ActionForm>
      </Dialog>

      <Dialog open={dialog === "import"} onClose={() => setDialog(null)} title="Import users from CSV" wide>
        <ImportForm />
      </Dialog>
    </>
  );
}

function ImportForm() {
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();
  if (result) {
    return (
      <div className="space-y-4 text-sm">
        <p><strong>{result.created.length}</strong> account(s) created{result.errors.length > 0 && <>, <strong className="text-danger">{result.errors.length}</strong> row(s) skipped</>}.</p>
        {result.created.length > 0 && (
          <>
            <Button onClick={() => downloadCsv("new-accounts.csv", [["name", "email", "studentId", "temporaryPassword"], ...result.created.map((c) => [c.name, c.email, c.studentId ?? "", c.password])])}>
              <Download className="size-4" /> Download credentials (CSV)
            </Button>
            <p className="text-xs text-muted">Passwords are shown only now. Distribute them securely; each user must change theirs at first sign-in.</p>
          </>
        )}
        {result.errors.length > 0 && <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-danger">{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Columns: <code>name</code>, <code>email</code>, <code>studentId</code>, and optionally <code>role</code> (default student), <code>department</code>, <code>program</code>.</p>
      <input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} className="text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
      <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={8} className="font-mono text-xs" placeholder={"name,email,studentId,department,program\nAnanya Rao,ananya.rao@uni.edu,22CS1043,Computer Science,B.Tech CSE Year 2"} />
      <Button disabled={pending || !csv.trim()} onClick={() => start(async () => setResult(await importUsers(csv)))}>{pending ? "Importing…" : "Import"}</Button>
    </div>
  );
}

export function UserActions({ userId, name, active }: { userId: string; name: string; active: boolean }) {
  const [pending, start] = useTransition();
  const [password, setPassword] = useState<string | null>(null);
  const btn = "grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground [&>svg]:size-4";
  return (
    <span className="inline-flex gap-1">
      <button
        className={btn}
        disabled={pending}
        title="Reset password"
        aria-label={`Reset password for ${name}`}
        onClick={() =>
          confirm(`Reset ${name}'s password? They'll be signed out everywhere.`) &&
          start(async () => {
            const r = await resetUserPassword(userId);
            if (r.password) setPassword(r.password);
            else toast.error(r.error ?? "Reset failed.");
          })
        }
      >
        <KeyRound />
      </button>
      <button
        className={`${btn} ${active ? "hover:!text-danger" : "hover:!text-success"}`}
        disabled={pending}
        title={active ? "Deactivate" : "Reactivate"}
        aria-label={`${active ? "Deactivate" : "Reactivate"} ${name}`}
        onClick={() =>
          confirm(active ? `Deactivate ${name}? They lose access immediately; their work is kept.` : `Reactivate ${name}?`) &&
          start(async () => {
            const r = await setUserActive(userId, !active);
            if (r?.error) toast.error(r.error);
            else toast.success(active ? `${name} deactivated.` : `${name} reactivated.`);
          })
        }
      >
        <Power />
      </button>
      <Dialog open={password !== null} onClose={() => setPassword(null)} title="Password reset">
        <div className="space-y-3 text-left text-sm">
          <p>New temporary password for <strong>{name}</strong>:</p>
          <p className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 font-mono text-base">{password} {password && <CopyButton text={password} />}</p>
          <p className="text-muted">Shown once. They&apos;ve been signed out and must choose a new password at next sign-in.</p>
        </div>
      </Dialog>
    </span>
  );
}
