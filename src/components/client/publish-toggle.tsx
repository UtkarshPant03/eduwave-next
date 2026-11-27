"use client";

import { useOptimistic, useTransition } from "react";
import { setCoursePublished } from "@/app/actions/admin";

/** Accessible switch that publishes/hides a course. */
export function PublishToggle({ courseId, published }: { courseId: string; published: boolean }) {
  const [on, setOn] = useOptimistic(published);
  const [, start] = useTransition();
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={on ? "Hide course from students" : "Publish course"}
      onClick={() => start(async () => { setOn(!on); await setCoursePublished(courseId, !on); })}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${on ? "bg-brand" : "bg-border"}`}
    >
      <span className={`inline-block size-4 rounded-full bg-white shadow transition ${on ? "translate-x-4.5" : "translate-x-0.5"}`} />
    </button>
  );
}
