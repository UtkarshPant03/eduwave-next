"use client";

import { Star, UserMinus, Users, X } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { enrolLinkedSections, removeCourseStaff, setPrimaryInstructor, unlinkCourseSection } from "@/app/actions/institution";
import { Button } from "@/components/ui";

const iconBtn = "grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-50";

/** Make primary / remove, for one course-staff row (admin course page). */
export function StaffActions({ courseId, userId, name, primary, canBePrimary }: { courseId: string; userId: string; name: string; primary: boolean; canBePrimary: boolean }) {
  const [pending, start] = useTransition();
  if (primary) return null;
  return (
    <span className="flex">
      {canBePrimary && (
        <button
          className={iconBtn}
          disabled={pending}
          aria-label={`Make ${name} the primary instructor`}
          title="Make primary instructor"
          onClick={() =>
            start(async () => {
              const r = await setPrimaryInstructor(courseId, userId);
              if (r.error) toast.error(r.error);
              else toast.success(`${name} is now the primary instructor.`);
            })
          }
        >
          <Star className="size-4" />
        </button>
      )}
      <button
        className={`${iconBtn} hover:!bg-danger/10 hover:!text-danger`}
        disabled={pending}
        aria-label={`Remove ${name} from the course staff`}
        title="Remove from staff"
        onClick={() => {
          if (confirm(`Remove ${name} from this course's staff?`))
            start(async () => {
              const r = await removeCourseStaff(courseId, userId);
              if (r.error) toast.error(r.error);
              else toast.success(`${name} removed.`);
            });
        }}
      >
        <UserMinus className="size-4" />
      </button>
    </span>
  );
}

export function UnlinkSectionButton({ courseId, sectionId, label }: { courseId: string; sectionId: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className={`${iconBtn} hover:!bg-danger/10 hover:!text-danger`}
      disabled={pending}
      aria-label={`Unlink section ${label}`}
      title="Unlink (enrolled students stay enrolled)"
      onClick={() => start(async () => void (await unlinkCourseSection(courseId, sectionId)))}
    >
      <X className="size-4" />
    </button>
  );
}

export function EnrolSectionsButton({ courseId, disabledReason }: { courseId: string; disabledReason?: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant="secondary"
        disabled={pending || Boolean(disabledReason)}
        onClick={() =>
          start(async () => {
            const r = await enrolLinkedSections(courseId);
            if (r.error) toast.error(r.error);
            else toast.success(`${r.added} student(s) enrolled.`);
          })
        }
      >
        <Users className="size-4" /> {pending ? "Enrolling…" : "Enrol students of linked sections"}
      </Button>
      {disabledReason && <p className="text-xs text-muted">{disabledReason}</p>}
    </div>
  );
}
