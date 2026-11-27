"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { Input } from "@/components/ui";

/** "2026-11-27T14:30" in the browser's own time zone (the format datetime-local expects). */
function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * A datetime-local input pre-filled from an ISO timestamp.
 *
 * Why an effect instead of defaultValue? The server renders this component too, and the
 * server's time zone is not the user's. Filling the value after hydration means the user
 * always sees the time in their own zone, and the form submits it back as ISO (UTC).
 */
export function LocalDateTimeInput({ iso, ...props }: { iso?: string } & Omit<ComponentProps<"input">, "type" | "defaultValue">) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (iso && ref.current && !ref.current.value) ref.current.value = toLocalInputValue(new Date(iso));
  }, [iso]);
  return <Input ref={ref} type="datetime-local" {...props} />;
}
