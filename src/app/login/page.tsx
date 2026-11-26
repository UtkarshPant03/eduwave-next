import type { Metadata } from "next";
import Link from "next/link";
import { loginStudent, loginTeacher } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input } from "@/components/ui";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-16">
      <Link href="/" className="text-lg font-semibold">
        edu<span className="text-accent">Wave</span>
      </Link>
      <h1 className="mt-6 text-2xl font-semibold">Log in</h1>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card title="Student">
          <ActionForm action={loginStudent} submitLabel="Log in as student">
            <Field label="Roll number" hint="Given to you by your teacher.">
              <Input name="rollNumber" autoComplete="username" required />
            </Field>
            <Field label="Password">
              <Input name="password" type="password" autoComplete="current-password" required />
            </Field>
          </ActionForm>
        </Card>
        <Card title="Teacher">
          <ActionForm action={loginTeacher} submitLabel="Log in as teacher">
            <Field label="Email">
              <Input name="email" type="email" autoComplete="email" required />
            </Field>
            <Field label="Password">
              <Input name="password" type="password" autoComplete="current-password" required />
            </Field>
          </ActionForm>
          <p className="mt-4 text-sm text-muted">
            New teacher? <Link href="/register" className="text-accent underline">Register with an invite code</Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
