"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import type { FormState } from "@/lib/form";
import { Button, FormMessage } from "./ui";

/**
 * Wraps a Server Action in a form with pending state and an error/success message.
 *
 * React 19 resets a <form action={...}> after every submission, which wipes what the
 * user typed even when validation fails. We submit via onSubmit instead and only
 * reset on success.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  className = "grid gap-3",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {children}
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Working…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
