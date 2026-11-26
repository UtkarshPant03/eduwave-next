"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import type { FormState } from "@/lib/form";
import { Button, FormMessage } from "./ui";

/**
 * Wraps a Server Action in a form with pending state, an inline message and a toast.
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
  toastOnSuccess = true,
  persistentSuccess = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children: ReactNode;
  className?: string;
  toastOnSuccess?: boolean;
  /** Keep the success text on screen (e.g. a one-time password the user must copy). */
  persistentSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      if (toastOnSuccess && !persistentSuccess) toast.success(state.success);
    }
  }, [state, toastOnSuccess, persistentSuccess]);

  const shown = state?.error || persistentSuccess || !toastOnSuccess ? state : undefined;

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
      {shown?.success && persistentSuccess ? (
        <p role="status" className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm text-success select-all">
          {shown.success}
        </p>
      ) : (
        <FormMessage state={shown} />
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Working…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
