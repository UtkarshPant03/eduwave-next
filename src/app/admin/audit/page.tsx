import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { Badge, Card, PageHeader, Table } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/dal";
import { siteAudit } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage() {
  await requireAdmin();
  const rows = await siteAudit(200);
  return (
    <>
      <PageHeader eyebrow="Manage" title="Audit log" subtitle="The latest 200 security-relevant events across the site." />
      <Card icon={<ScrollText />} title="Events">
        <Table head={["When", "Event", "User", "Detail", "IP"]}>
          {rows.map((a, i) => (
            <tr key={i}>
              <td className="whitespace-nowrap px-2 py-2 text-muted">{formatDateTime(a.createdAt)}</td>
              <td className="px-2 py-2"><Badge tone={a.action === "login_failed" || a.action === "login_locked" || a.action === "user_deactivated" ? "danger" : "neutral"}>{a.action.replace(/_/g, " ")}</Badge></td>
              <td className="px-2 py-2">{a.user ?? "–"}<span className="block text-xs text-muted">{a.email}</span></td>
              <td className="px-2 py-2 text-xs text-muted">{a.detail}</td>
              <td className="px-2 py-2 font-mono text-xs text-muted">{a.ip}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
