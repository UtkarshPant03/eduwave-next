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
    <div className="mb-6 animate-fade-in">
      <Breadcrumbs items={breadcrumbs} />
      <CourseCover code={course.code} color={course.color} className="rounded-3xl shadow-card-lg">
        <div className="relative flex flex-wrap items-end gap-6 p-6 pt-14 text-white sm:p-8 sm:pt-16">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs font-semibold tracking-widest text-white/80">{course.code}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{course.title}</h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-white/85 [&_svg]:shrink-0">
              <span className="flex items-center gap-1.5"><CalendarRange className="size-4" /> {course.term}</span>
              <span className="flex items-center gap-1.5"><Layers className="size-4" /> {course.credits} credits · {course.department}</span>
              {instructor && <span className="flex items-center gap-1.5"><GraduationCap className="size-4" /> {instructor}</span>}
              {students != null && <span className="flex items-center gap-1.5"><Users className="size-4" /> {students} enrolled</span>}
            </div>
          </div>
          {progress != null && (
            <div className="flex items-center gap-3 rounded-2xl bg-white/15 px-4 py-3 backdrop-blur [&_circle:first-of-type]:stroke-white/25 [&_circle:last-of-type]:stroke-white">
              <ProgressRing value={progress} label="Course progress" />
              <span className="text-sm">Your<br />progress</span>
            </div>
          )}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      </CourseCover>
    </div>
  );
}
