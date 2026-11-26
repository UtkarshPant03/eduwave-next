import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { ResourceFilter } from "@/components/client/resource-filter";
import { ResourceList } from "@/components/resource-list";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireStudent } from "@/lib/auth/dal";
import { listResources } from "@/lib/data";

export const metadata: Metadata = { title: "Resources" };

export default async function StudentResourcesPage() {
  const student = await requireStudent();
  const resources = await listResources(student.classId);
  const subjects = [...new Set(resources.map((r) => r.subject))].sort();

  return (
    <>
      <PageHeader title="Resources" subtitle="Notes, files and links shared by your teacher." />
      <Card>
        {resources.length === 0 ? (
          <Empty icon={<BookOpen />}>Nothing shared yet.</Empty>
        ) : (
          <ResourceFilter
            subjects={subjects}
            items={resources.map((r) => ({
              key: r.id,
              subject: r.subject,
              text: `${r.title} ${r.subject} ${r.fileName ?? ""}`,
              node: <ResourceList resources={[r]} />,
            }))}
          />
        )}
      </Card>
    </>
  );
}
