import type { Metadata } from "next";
import Link from "next/link";
import { registerTeacher } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input } from "@/components/ui";

export const metadata: Metadata = { title: "Teacher registration" };

export default function RegisterPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-16">
      <Link href="/" className="text-lg font-semibold">
        edu<span className="text-accent">Wave</span>
      </Link>
      <h1 className="mt-6 text-2xl font-semibold">Teacher registration</h1>
      <p className="mt-1 text-sm text-muted">
        Students don&apos;t register themselves; teachers create their logins.
      </p>
      <Card className="mt-6">
        <ActionForm action={registerTeacher} submitLabel="Create account">
          <Field label="Full name">
            <Input name="name" autoComplete="name" required />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password" hint="At least 10 characters.">
            <Input name="password" type="password" autoComplete="new-password" minLength={10} required />
          </Field>
          <Field label="Invite code" hint="Ask your school's eduWave administrator.">
            <Input name="inviteCode" required />
          </Field>
        </ActionForm>
      </Card>
      <p className="mt-4 text-sm text-muted">
        Already registered? <Link href="/login" className="text-accent underline">Log in</Link>
      </p>
    </main>
  );
}
