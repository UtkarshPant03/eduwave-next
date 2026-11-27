import type { Metadata } from "next";
import { Award, BookOpen, GraduationCap } from "lucide-react";
import Link from "next/link";
import { SubjectBars } from "@/components/client/charts";
import { CourseCover } from "@/components/course-cover";
import { Card, Empty, PageHeader, StatTile, Table } from "@/components/ui";
import { requireStudent } from "@/lib/auth/dal";
import { listStudentCourses } from "@/lib/data/courses";
import { gradebook } from "@/lib/data/gradebook";
import { formatPercent } from "@/lib/format";
import { GRADE_SCALE } from "@/lib/grading";

export const metadata: Metadata = { title: "Grades" };

export default async function GradesPage() {
  const user = await requireStudent();
  const courses = await listStudentCourses(user.id);
  const books = await Promise.all(courses.map(async (c) => ({ course: c, row: (await gradebook(c.id, user.id)).rows[0] })));
  const graded = books.filter((b) => b.row?.total.letter);
  // Credit-weighted grade-point average over courses with a grade so far.
  const credits = graded.reduce((s, b) => s + b.course.credits, 0);
  const gpa = credits ? graded.reduce((s, b) => s + b.row!.total.letter!.points * b.course.credits, 0) / credits : null;

  return (
    <>
      <PageHeader eyebrow="Learning" title="Grades" subtitle="Running totals for each course. Final grades are confirmed by your instructors." />
      <div className="stagger mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile label="Running GPA (10-point)" value={gpa == null ? "–" : gpa.toFixed(2)} icon={<GraduationCap />} hint="Credit-weighted, provisional" />
        <StatTile label="Courses with grades" value={`${graded.length} / ${courses.length}`} icon={<BookOpen />} tone="neutral" />
        <StatTile label="Credits enrolled" value={courses.reduce((s, c) => s + c.credits, 0)} icon={<Award />} tone="success" />
      </div>
      {courses.length === 0 ? (
        <Empty>You&apos;re not enrolled in any courses.</Empty>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
          <Card title="By course">
            <Table head={["Course", "Credits", "Points", "Percent", "Grade"]}>
              {books.map(({ course, row }) => (
                <tr key={course.id}>
                  <td className="px-2 py-2">
                    <Link href={`/student/courses/${course.id}#grades`} className="flex items-center gap-3 hover:text-accent">
                      <CourseCover code="" color={course.color} className="size-9 shrink-0 rounded-lg" />
                      <span>
                        <span className="font-medium">{course.code}</span>
                        <span className="block text-xs text-muted">{course.title}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-2 py-2 tabular-nums">{course.credits}</td>
                  <td className="px-2 py-2 tabular-nums">{row?.total.possible ? `${row.total.earned} / ${row.total.possible}` : "–"}</td>
                  <td className="px-2 py-2 tabular-nums">{formatPercent(row?.total.percent)}</td>
                  <td className="px-2 py-2">{row?.total.letter ? <span className="rounded-lg bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">{row.total.letter.letter}</span> : "–"}</td>
                </tr>
              ))}
            </Table>
          </Card>
          <div className="space-y-6">
            {graded.length > 0 && (
              <Card title="Percent by course">
                <SubjectBars data={graded.map((b) => ({ subject: b.course.code, averagePercent: b.row!.total.percent ?? 0 }))} />
              </Card>
            )}
            <Card title="Grade scale">
              <ul className="grid grid-cols-2 gap-1.5 text-xs">
                {GRADE_SCALE.map((g) => (
                  <li key={g.letter} className="flex justify-between rounded-lg bg-surface-2 px-2.5 py-1.5">
                    <span className="font-semibold">{g.letter} <span className="font-normal text-muted">({g.points})</span></span>
                    <span className="text-muted">≥ {g.min}%</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
