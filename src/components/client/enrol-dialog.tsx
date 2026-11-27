"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { enrolWithKey } from "@/app/actions/student";
import { ActionForm } from "@/components/action-form";
import { buttonClass, Field, Input } from "@/components/ui";
import type { FormState } from "@/lib/form";
import { Dialog } from "./dialog";

export function EnrolDialog({ courseId, label, trigger }: { courseId: string; label: string; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  // Wrap the action: on success, close the modal first, then open the course.
  async function action(state: FormState, fd: FormData) {
    const res = await enrolWithKey(state, fd);
    if (res?.success) {
      setOpen(false);
      router.push(`/student/courses/${courseId}`);
    }
    return res;
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={`${buttonClass("primary", "sm")} w-full`}>{trigger}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Enrol in ${label}`}>
        <ActionForm action={action} submitLabel="Enrol">
          <input type="hidden" name="courseId" value={courseId} />
          <Field label="Enrolment key" hint="Your instructor shares this in class or on the course notice board.">
            <Input name="key" required autoFocus autoComplete="off" />
          </Field>
        </ActionForm>
      </Dialog>
    </>
  );
}
