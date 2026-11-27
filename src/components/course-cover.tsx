import Link from "next/link";
import { GraduationCap, Users } from "lucide-react";
import { coverFor } from "@/lib/course-colors";
import { Badge, cx, Progress } from "./ui";

/**
 * A course's identifying colour, used sparingly: a solid swatch or a thin strip, never a
 * full-bleed gradient. Colour helps people scan a list; the code and title identify the course.
 */
export function CourseCover({ code, color, className, children }: { code: string; color: string; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cx("relative overflow-hidden", className)} style={{ background: coverFor(color).from }} aria-hidden={!children}>
      {code && <span className="sr-only">{code}</span>}
      {children}
    </div>
  );
}

export type CourseCardData = {
  id: string;
  code: string;
  title: string;
  term: string;
  department: string;
  credits: number;
  color: string;
  published?: boolean;
  instructor?: string;
  students?: number;
  activities?: number;
  done?: number;
  toGrade?: number;
};

export function CourseCard({ course, href }: { course: CourseCardData; href: string }) {
  const progress = course.done != null && course.activities ? (course.done / course.activities) * 100 : null;
  return (
    <Link href={href} className="card-hover group block overflow-hidden rounded-xl border border-border bg-surface">
      <div className="h-1" style={{ background: coverFor(course.color).from }} aria-hidden />
      <div className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-mono font-semibold text-foreground">{course.code}</span>
          <span aria-hidden>·</span>
          <span>{course.term}</span>
          <span aria-hidden>·</span>
          <span>{course.credits} credits</span>
          {course.published === false && <Badge tone="warning">Hidden</Badge>}
          {course.toGrade ? <Badge tone="accent">{course.toGrade} to grade</Badge> : null}
        </div>
        <p className="line-clamp-2 font-semibold leading-snug group-hover:underline">{course.title}</p>
        <p className="flex flex-wrap items-center gap-3 text-xs text-muted">
          {course.instructor && (
            <span className="flex items-center gap-1"><GraduationCap className="size-3.5" aria-hidden /> {course.instructor}</span>
          )}
          {course.students != null && (
            <span className="flex items-center gap-1"><Users className="size-3.5" aria-hidden /> {course.students} enrolled</span>
          )}
        </p>
        {progress != null && <Progress value={progress} label={`${course.code} progress`} />}
      </div>
    </Link>
  );
}
