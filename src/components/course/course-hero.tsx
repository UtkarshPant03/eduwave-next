import { CalendarRange, GraduationCap, Layers, Users } from "lucide-react";
import type { ReactNode } from "react";
import { CourseCover } from "@/components/course-cover";
import { Breadcrumbs, ProgressRing } from "@/components/ui";

export function CourseHero({
  course,
  instructor,
  students,
  progress,
  actions,
  breadcrumbs,
}: {
  course: { code: string; title: string; term: string; credits: number; department: string; color: string };
  instructor?: string;
  students?: number;
  progress?: number | null;
  actions?: ReactNode;
  breadcrumbs: { label: string; href?: string }[];
}) {
  return (
    <div className="mb-6">
      <Breadcrumbs items={breadcrumbs} />
      <header className="overflow-hidden rounded-xl border border-border bg-surface">
        <CourseCover code="" color={course.color} className="h-1" />
        <div className="flex flex-wrap items-center gap-6 p-5 sm:p-6">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm font-semibold text-muted">{course.code}</p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-2xl">{course.title}</h1>
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted [&_svg]:shrink-0">
              <span className="flex items-center gap-1.5"><CalendarRange className="size-4" aria-hidden /> {course.term}</span>
              <span className="flex items-center gap-1.5"><Layers className="size-4" aria-hidden /> {course.credits} credits · {course.department}</span>
              {instructor && <span className="flex items-center gap-1.5"><GraduationCap className="size-4" aria-hidden /> {instructor}</span>}
              {students != null && <span className="flex items-center gap-1.5"><Users className="size-4" aria-hidden /> {students} enrolled</span>}
            </div>
          </div>
          {progress != null && (
            <div className="flex items-center gap-3">
              <ProgressRing value={progress} label="Course progress" />
              <span className="text-sm text-muted">Your<br />progress</span>
            </div>
          )}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      </header>
    </div>
  );
}
