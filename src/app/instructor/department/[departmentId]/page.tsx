import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StructureView } from "@/components/institution/structure-view";
import { PageHeader } from "@/components/ui";
import { requireInstructor } from "@/lib/auth/dal";
import { managesDepartment } from "@/lib/auth/scope";
import { db } from "@/db";
import { routeIds } from "@/lib/route-ids";

export const metadata: Metadata = { title: "Department" };

/** A department's structure and course offerings, for its administrators / HOD / dean. */
export default async function DepartmentPage({ params }: PageProps<"/instructor/department/[departmentId]">) {
  const { departmentId } = routeIds(await params);
  const user = await requireInstructor();
  if (!(await managesDepartment(user, departmentId))) notFound();
  const dept = await db.query.departments.findFirst({ where: (d, { eq }) => eq(d.id, departmentId) });
  if (!dept) notFound();
  return (
    <>
      <PageHeader eyebrow="Department" title={dept.name} subtitle="Programmes, batches, class sections and course offerings of your department." />
      <StructureView scope={{ departmentId }} />
    </>
  );
}
