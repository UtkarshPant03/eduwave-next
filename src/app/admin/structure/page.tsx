import type { Metadata } from "next";
import { StructureView } from "@/components/institution/structure-view";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Academic structure" };

/**
 * The university's academic structure as data: departments → programmes → batches →
 * class sections, and sessions → terms. Nothing is hard-coded; routine changes (a new
 * programme, batch or section) need no code change.
 */
export default async function StructurePage() {
  await requireAdmin();
  return (
    <>
      <PageHeader eyebrow="Manage" title="Academic structure" subtitle="Departments, programmes, terms, batches, class sections and department roles." />
      <StructureView scope="all" />
    </>
  );
}
