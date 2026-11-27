"use client";

import { UserMinus } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { unenrolStudent } from "@/app/actions/instructor";

export function UnenrolButton({ courseId, userId, name }: { courseId: string; userId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      aria-label={`Remove ${name} from course`}
      title="Remove from course"
      onClick={() => {
        if (confirm(`Remove ${name} from this course? Their submissions are kept if you re-enrol them.`))
          start(async () => {
            await unenrolStudent(courseId, userId);
            toast.success(`${name} removed.`);
          });
      }}
      className="grid size-8 place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger"
    >
      <UserMinus className="size-4" />
    </button>
  );
}
