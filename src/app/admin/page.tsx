import type { Metadata } from "next";
import { ArrowRight, BookOpen, GraduationCap, Inbox, ShieldAlert, UserCheck, Users } from "lucide-react";
import Link from "next/link";
import { Badge, Card, PageHeader, StatTile, Table } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/dal";
import { siteAudit, siteStats } from "@/lib/data/admin";
import { formatRelative, requestTime } from "@/lib/format";
import { greeting } from "@/lib/greeting";

export const metadata: Metadata = { title: "Administration" };

export default async function AdminHome() {
  const user = await requireAdmin();
  const [stats, audit] = await Promise.all([siteStats(), siteAudit(12)]);
  const now = requestTime();
  const failures = audit.filter((a) => a.action === "login_failed" || a.action === "login_locked").length;

  return (
    <>
      <PageHeader eyebrow={greeting(now)} title={`Administration · ${user.name}`} subtitle="Users, courses and security across the institution." />
      <div className="stagger mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Students" value={stats.byRole.student ?? 0} icon={<GraduationCap />} />
        <StatTile label="Instructors" value={stats.byRole.instructor ?? 0} icon={<UserCheck />} tone="success" />
        <StatTile label="Courses" value={stats.courses} icon={<BookOpen />} tone="neutral" hint={`${stats.enrollments} enrolments`} />
        <StatTile label="Submissions" value={stats.submissions} icon={<Inbox />} tone="neutral" hint="assignments + quizzes" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_20rem] [&>*]:min-w-0">
        <Card
          title="Recent security events"
          icon={<ShieldAlert />}
          description={failures ? `${failures} failed sign-in event(s) in this list.` : "No recent failed sign-ins."}
          action={<Link href="/admin/audit" className="flex items-center gap-1 text-sm text-accent hover:underline">Full log <ArrowRight className="size-3.5" /></Link>}
        >
          <Table head={["Event", "User", "When", "IP"]}>
            {audit.map((a, i) => (
              <tr key={i}>
                <td className="px-2 py-2">{a.action.startsWith("login_") && a.action !== "login" ? <Badge tone="danger">{a.action.replace("_", " ")}</Badge> : <Badge>{a.action.replace(/_/g, " ")}</Badge>}</td>
                <td className="px-2 py-2">{a.user ?? <span className="text-muted">{a.detail ?? "unknown"}</span>}</td>
                <td className="px-2 py-2 text-muted">{formatRelative(a.createdAt, now)}</td>
                <td className="px-2 py-2 font-mono text-xs text-muted">{a.ip}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <div className="space-y-4">
          {[
            { href: "/admin/users", icon: Users, title: "Manage users", body: "Create accounts, import CSVs, reset passwords." },
            { href: "/admin/courses", icon: BookOpen, title: "Manage courses", body: "Create courses and assign instructors." },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="card-hover group flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
              <span className="bg-brand grid size-10 place-items-center rounded-xl text-white"><l.icon className="size-5" /></span>
              <span>
                <span className="flex items-center gap-1 font-medium group-hover:text-accent">{l.title} <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" /></span>
                <span className="text-sm text-muted">{l.body}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
