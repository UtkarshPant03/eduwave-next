import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { Badge, buttonClass, Card, PageHeader, Pager, pageParam, Select, Table } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/dal";
import { auditPage } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Audit log" };

const ACTIONS = [
  "login", "login_failed", "login_locked", "logout", "password_changed", "password_reset", "sessions_revoked",
  "user_created", "user_deactivated", "user_reactivated", "course_created", "course_published", "course_hidden",
  "enrolment_added", "enrolment_removed", "activity_deleted", "grade_changed", "structure_changed", "course_staff_changed", "role_changed",
  "feedback_file_removed", "submissions_downloaded",
];
const DANGER = new Set(["login_failed", "login_locked", "user_deactivated", "activity_deleted"]);

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireAdmin();
  const sp = await searchParams;
  const action = typeof sp.action === "string" && ACTIONS.includes(sp.action) ? sp.action : "";
  const page = pageParam(sp.page);
  const { rows, total } = await auditPage({ action: action || undefined, page });
  return (
    <>
      <PageHeader eyebrow="Manage" title="Audit log" subtitle="Security and academic events across the site. Entries can't be edited or deleted." />
      <Card icon={<ScrollText />} title="Events">
        <form className="mb-4 flex flex-wrap gap-2" role="search">
          <Select name="action" defaultValue={action} className="w-60" aria-label="Event type">
            <option value="">All events</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a.replace(/_/g, " ")}</option>)}
          </Select>
          <button className={buttonClass("secondary")}>Filter</button>
        </form>
        <Table head={["When", "Event", "Account", "By", "Detail", "IP"]}>
          {rows.map((a) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap py-2 text-muted">{formatDateTime(a.createdAt)}</td>
              <td className="py-2"><Badge tone={DANGER.has(a.action) ? "danger" : "neutral"}>{a.action.replace(/_/g, " ")}</Badge></td>
              <td className="py-2">{a.user ?? "–"}<span className="block text-xs text-muted">{a.email}</span></td>
              <td className="py-2 text-muted">{a.actor ?? ""}</td>
              <td className="py-2 text-xs text-muted">{a.detail}</td>
              <td className="py-2 font-mono text-xs text-muted">{a.ip}</td>
            </tr>
          ))}
        </Table>
        <Pager path="/admin/audit" page={page} total={total} params={{ action }} />
      </Card>
    </>
  );
}
