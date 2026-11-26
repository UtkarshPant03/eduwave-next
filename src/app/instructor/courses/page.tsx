import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { CourseCard } from "@/components/course-cover";
import { Empty, PageHeader } from "@/components/ui";
import { requireInstructor } from "@/lib/auth/dal";
import { listInstructorCourses } from "@/lib/data/courses";

export const metadata: Metadata = { title: "My courses" };

export default async function InstructorCourses() {
  const user = await requireInstructor();
  const courses = await listInstructorCourses(user.id);
  const terms = [...new Set(courses.map((c) => c.term))];
  return (
    <>
      <PageHeader eyebrow="Teaching" title="My courses" subtitle={`${courses.length} course${courses.length === 1 ? "" : "s"} across ${terms.length} term${terms.length === 1 ? "" : "s"}`} />
      {courses.length === 0 && <Empty icon={<BookOpen />}>No courses assigned yet.</Empty>}
      {terms.map((term) => (
        <section key={term} className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-muted">{term}</h2>
          <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {courses.filter((c) => c.term === term).map((c) => <CourseCard key={c.id} course={c} href={`/instructor/courses/${c.id}`} />)}
          </div>
        </section>
      ))}
    </>
  );
}
