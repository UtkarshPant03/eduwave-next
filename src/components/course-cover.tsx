import Link from "next/link";
import { BookOpen, GraduationCap, Users } from "lucide-react";
import { coverFor } from "@/lib/course-colors";
import { Badge, cx, Progress } from "./ui";

/** Deterministic pattern choice per course code, so covers differ but never change. */
const patternFor = (seed: string) => [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 3;

/** Gradient banner with a subtle geometric SVG pattern. Pure CSS/SVG: no image assets. */
export function CourseCover({ code, color, className, children }: { code: string; color: string; className?: string; children?: React.ReactNode }) {
  const c = coverFor(color);
  const p = patternFor(code);
  return (
    <div className={cx("relative overflow-hidden", className)} style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}>
      <svg className="absolute inset-0 size-full opacity-25" aria-hidden preserveAspectRatio="xMidYMid slice" viewBox="0 0 200 100">
        {p === 0 &&
          Array.from({ length: 6 }, (_, i) => <circle key={i} cx={170} cy={10} r={18 + i * 16} fill="none" stroke={c.accent} strokeWidth="1" />)}
        {p === 1 &&
          Array.from({ length: 10 }, (_, i) => <line key={i} x1={i * 24 - 40} y1={100} x2={i * 24 + 40} y2={0} stroke={c.accent} strokeWidth="1" />)}
        {p === 2 &&
          Array.from({ length: 4 }, (_, row) =>
            Array.from({ length: 9 }, (_, col) => <rect key={`${row}-${col}`} x={col * 24 + (row % 2) * 12} y={row * 26} width="8" height="8" rx="2" fill={c.accent} opacity={0.6} transform={`rotate(45 ${col * 24 + 4} ${row * 26 + 4})`} />),
          )}
      </svg>
      <span className="absolute right-3 top-2 font-mono text-[11px] font-semibold tracking-widest text-white/80">{code}</span>
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
    <Link href={href} className="card-hover group block overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <CourseCover code={course.code} color={course.color} className="h-24">
        <span className="absolute bottom-2 left-3 grid size-9 place-items-center rounded-xl bg-white/15 text-white backdrop-blur transition group-hover:scale-105">
          <BookOpen className="size-4" />
        </span>
      </CourseCover>
      <div className="space-y-2 p-4">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>{course.term}</span>
          <span aria-hidden>·</span>
          <span>{course.credits} credits</span>
          {course.published === false && <Badge tone="warning">Hidden</Badge>}
          {course.toGrade ? <Badge tone="accent">{course.toGrade} to grade</Badge> : null}
        </div>
        <p className="line-clamp-2 font-semibold leading-snug group-hover:text-accent">{course.title}</p>
        <p className="flex items-center gap-3 text-xs text-muted">
          {course.instructor && (
            <span className="flex items-center gap-1"><GraduationCap className="size-3.5" /> {course.instructor}</span>
          )}
          {course.students != null && (
            <span className="flex items-center gap-1"><Users className="size-3.5" /> {course.students}</span>
          )}
        </p>
        {progress != null && <Progress value={progress} label={`${course.code} progress`} />}
      </div>
    </Link>
  );
}
