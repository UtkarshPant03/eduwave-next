import type { Metadata } from "next";
import { Suspense } from "react";
import { BookOpenCheck, CalendarCheck2, ShieldCheck } from "lucide-react";
import { login } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { Logo } from "@/components/brand";
import { NextField, PasswordInput } from "@/components/client/login-fields";
import { Field, Input } from "@/components/ui";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <section className="bg-brand hidden p-12 text-white lg:flex lg:flex-col">
        <div>
          <div className="inline-flex rounded-lg bg-white px-3 py-2 text-[#202b36]"><Logo /></div>
        </div>
        <div className="mt-auto max-w-md">
          <h1 className="text-2xl font-semibold leading-snug">Your courses, deadlines and grades in one place.</h1>
          <ul className="mt-6 space-y-3 text-white/90">
            <li className="flex items-center gap-3"><BookOpenCheck className="size-5" aria-hidden /> Course materials and assignments, week by week</li>
            <li className="flex items-center gap-3"><CalendarCheck2 className="size-5" aria-hidden /> A calendar of every deadline and live class</li>
            <li className="flex items-center gap-3"><ShieldCheck className="size-5" aria-hidden /> Secure accounts issued by your institution</li>
          </ul>
        </div>
      </section>

      {/* Form */}
      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Sign in with your university email or student ID.</p>
          <div className="mt-6 rounded-xl border border-border bg-surface p-6">
            <ActionForm action={login} submitLabel="Sign in" toastOnSuccess={false} fullWidthSubmit>
              <Suspense>
                <NextField />
              </Suspense>
              <Field label="Email or student ID">
                <Input name="identifier" autoComplete="username" required autoFocus placeholder="name@university.edu or 22CS1043" />
              </Field>
              {/* Not wrapped in <Field>/<label>: the show-password button must not become part of the input's label. */}
              <div className="grid gap-1.5 text-sm">
                <label htmlFor="password" className="font-medium">Password</label>
                <PasswordInput id="password" name="password" autoComplete="current-password" required />
              </div>
            </ActionForm>
          </div>
          <p className="mt-6 text-center text-sm text-muted">
            Forgot your password? Contact your instructor or the IT helpdesk to have it reset.
          </p>
        </div>
      </section>
    </main>
  );
}
