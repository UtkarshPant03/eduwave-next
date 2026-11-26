"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { scheduleLive } from "@/app/actions/teacher";
import { Button, Field, FormMessage, Input, Select } from "@/components/ui";

/** Schedule a Jitsi live class. Local time is converted to UTC in the browser. */
export function LiveForm({ classes, fixedClassId }: { classes: { id: string; name: string }[]; fixedClassId?: string }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const local = String(fd.get("startsAt") ?? "");
        startTransition(async () => {
          const res = await scheduleLive({
            classId: fixedClassId ?? String(fd.get("classId")),
            title: String(fd.get("title")),
            startsAt: local ? new Date(local).toISOString() : "",
            durationMinutes: Number(fd.get("durationMinutes")),
          });
          if (res?.error) setError(res.error);
          else {
            setError(undefined);
            form.reset();
            toast.success(res?.success ?? "Scheduled.");
          }
        });
      }}
    >
      {!fixedClassId && (
        <Field label="Class">
          <Select name="classId" required>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Topic"><Input name="title" required maxLength={120} placeholder="e.g. Revision: Chapter 4" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Starts at"><Input name="startsAt" type="datetime-local" required /></Field>
        <Field label="Duration (minutes)"><Input name="durationMinutes" type="number" min={10} max={240} defaultValue={45} required /></Field>
      </div>
      <FormMessage state={{ error }} />
      <div><Button disabled={pending}>{pending ? "Scheduling…" : "Schedule & notify class"}</Button></div>
    </form>
  );
}
