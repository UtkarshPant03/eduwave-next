import type { Metadata } from "next";
import { ArrowRight, BookOpen } from "lucide-react";
import Link from "next/link";
import { CourseCard } from "@/components/course-cover";
import { buttonClass, Empty, PageHeader } from "@/components/ui";
import { requireStudent } from "@/lib/auth/dal";
import { listStudentCourses } from "@/lib/data/courses";

export const metadata: Metadata = { title: "My courses" };

export default async function StudentCourses() {
  const user = await requireStudent();
  const courses = await listStudentCourses(user.id);
  const credits = courses.reduce((s, c) => s + c.credits, 0);
  return (
    <>
      <PageHeader
        eyebrow="Learning"
        title="My courses"
        subtitle={`${courses.length} course${courses.length === 1 ? "" : "s"} · ${credits} credits`}
        action={<Link href="/student/catalog" className={buttonClass("secondary")}>Browse catalogue <ArrowRight className="size-4" /></Link>}
      />
      {courses.length === 0 ? (
        <Empty icon={<BookOpen />}>You&apos;re not enrolled in any courses yet.</Empty>
      ) : (
        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {courses.map((c) => <CourseCard key={c.id} course={c} href={`/student/courses/${c.id}`} />)}
        </div>
      )}
    </>
  );
}
