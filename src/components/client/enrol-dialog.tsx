"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { enrolWithKey } from "@/app/actions/student";
import { ActionForm } from "@/components/action-form";
import { buttonClass, Field, Input } from "@/components/ui";
import type { FormState } from "@/lib/form";
import { Dialog } from "./dialog";

export function EnrolDialog({ courseId, label, trigger }: { courseId: string; label: string; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [enrolled, setEnrolled] = useState(false);
  useEffect(() => {
    if (enrolled) router.push(`/student/courses/${courseId}`);
  }, [enrolled, courseId, router]);

  // Wrap the action to navigate into the course after a successful enrolment.
  async function action(state: FormState, fd: FormData) {
    const res = await enrolWithKey(state, fd);
    if (res?.success) setEnrolled(true);
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
