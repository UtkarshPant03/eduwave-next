"use client";

import { Check } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { setCompletion } from "@/app/actions/student";

/** "Mark as done" checkbox with an optimistic tick. */
export function CompletionToggle({ courseId, itemId, done }: { courseId: string; itemId: string; done: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(done);
  const [, start] = useTransition();
  return (
    <button
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          await setCompletion(courseId, itemId, !optimistic);
        })
      }
      role="checkbox"
      aria-checked={optimistic}
      aria-label={optimistic ? "Mark as not done" : "Mark as done"}
      title={optimistic ? "Done" : "Mark as done"}
      className={`grid size-6 shrink-0 place-items-center rounded-lg border transition ${
        optimistic ? "border-success bg-success text-white animate-pop" : "border-border hover:border-success"
      }`}
    >
      {optimistic && <Check className="size-3.5" strokeWidth={3} />}
    </button>
  );
}
