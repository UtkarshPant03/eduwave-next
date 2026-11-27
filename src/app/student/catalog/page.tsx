import type { Metadata } from "next";
import { CheckCircle2, GraduationCap, KeyRound, Lock, Users } from "lucide-react";
import Link from "next/link";
import { EnrolDialog } from "@/components/client/enrol-dialog";
import { CatalogFilter } from "@/components/client/catalog-filter";
import { CourseCover } from "@/components/course-cover";
import { Badge, buttonClass, PageHeader } from "@/components/ui";
import { requireStudent } from "@/lib/auth/dal";
import { courseCatalog } from "@/lib/data/courses";

export const metadata: Metadata = { title: "Course catalogue" };

export default async function CatalogPage() {
  const user = await requireStudent();
  const courses = await courseCatalog(user.id);
  const departments = [...new Set(courses.map((c) => c.department))].sort();

  return (
    <>
      <PageHeader eyebrow="Learning" title="Course catalogue" subtitle="Browse courses offered this term. Enrol with the key your instructor shares in class." />
      <CatalogFilter
        departments={departments}
        items={courses.map((c) => ({
          key: c.id,
          department: c.department,
          text: `${c.code} ${c.title} ${c.instructor} ${c.department}`,
          node: (
            <article className="card-hover flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
              <CourseCover code={c.code} color={c.color} className="h-20" />
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Badge>{c.department}</Badge> {c.term} · {c.credits} credits
                </div>
                <h3 className="font-semibold leading-snug">{c.title}</h3>
                {c.description && <p className="line-clamp-3 text-sm text-muted">{c.description}</p>}
                <p className="mt-auto flex items-center gap-3 pt-2 text-xs text-muted">
                  <span className="flex items-center gap-1"><GraduationCap className="size-3.5" /> {c.instructor}</span>
                  <span className="flex items-center gap-1"><Users className="size-3.5" /> {c.students}</span>
                </p>
                <div className="pt-2">
                  {c.enrolled ? (
                    <Link href={`/student/courses/${c.id}`} className={`${buttonClass("secondary", "sm")} w-full`}><CheckCircle2 className="size-3.5 text-success" /> Enrolled · Open</Link>
                  ) : c.selfEnrol ? (
                    <EnrolDialog courseId={c.id} label={`${c.code} · ${c.title}`} trigger={<><KeyRound className="size-3.5" /> Enrol with key</>} />
                  ) : (
                    <p className="flex items-center justify-center gap-1.5 rounded-xl bg-surface-2 py-1.5 text-xs text-muted"><Lock className="size-3.5" /> Enrolment by instructor only</p>
                  )}
                </div>
              </div>
            </article>
          ),
        }))}
      />
    </>
  );
}
