import type { Metadata } from "next";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireStudent } from "@/lib/auth/dal";
import { listResources } from "@/lib/data";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Resources" };

export default async function StudentResourcesPage() {
  const student = await requireStudent();
  const resources = await listResources(student.classId);

  return (
    <>
      <PageHeader title="Resources" subtitle="Shared by your teacher." />
      <Card>
        {resources.length === 0 ? (
          <Empty>Nothing shared yet.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {resources.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline">
                  {r.title}
                </a>
                <span className="flex items-center gap-2 text-muted">
                  <Badge>{r.subject}</Badge> {formatDateTime(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
