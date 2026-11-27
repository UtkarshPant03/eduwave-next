import type { Metadata } from "next";
import { Search } from "lucide-react";
import { UserActions, UserAdminToolbar } from "@/components/client/user-admin";
import { Avatar, Badge, Card, Input, PageHeader, Select, Table, buttonClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/dal";
import { listUsers } from "@/lib/data/admin";
import { formatRelative, requestTime } from "@/lib/format";

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const role = typeof sp.role === "string" ? sp.role : "";
  const users = await listUsers({ q, role });
  const now = requestTime();

  return (
    <>
      <PageHeader eyebrow="Manage" title="Users" subtitle={`${users.length} user${users.length === 1 ? "" : "s"}${q || role ? " matching your filters" : ""}`} action={<UserAdminToolbar />} />
      <Card>
        {/* Plain GET form: filters live in the URL, so they're shareable and survive reloads. */}
        <form className="mb-4 flex flex-wrap gap-2" role="search">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input name="q" defaultValue={q} placeholder="Search name, email or student ID" className="pl-9" aria-label="Search users" />
          </div>
          <Select name="role" defaultValue={role} className="w-40" aria-label="Role">
            <option value="">All roles</option>
            <option value="student">Students</option>
            <option value="instructor">Instructors</option>
            <option value="admin">Admins</option>
          </Select>
          <button className={buttonClass("secondary")}>Filter</button>
        </form>
        <Table head={["User", "Role", "Department", "Courses", "Last sign-in", "Status", ""]}>
          {/* Deactivated rows get a tinted background (plus the status badge), not opacity:
              fading text below 4.5:1 contrast makes it unreadable for low-vision admins. */}
          {users.map((u) => (
            <tr key={u.id} className={u.active ? undefined : "bg-surface-2/60"}>
              <td className="px-2 py-2">
                <span className="flex items-center gap-2">
                  <Avatar name={u.name} size="sm" />
                  <span>
                    {u.name}
                    <span className="block text-xs text-muted">{u.email}{u.studentId && ` · ${u.studentId}`}</span>
                  </span>
                </span>
              </td>
              <td className="px-2 py-2"><Badge tone={u.role === "admin" ? "danger" : u.role === "instructor" ? "accent" : "neutral"}>{u.role}</Badge></td>
              <td className="px-2 py-2 text-muted">{u.department ?? "–"}</td>
              <td className="px-2 py-2 tabular-nums">{u.courses}</td>
              <td className="px-2 py-2 text-muted">{u.lastLoginAt ? formatRelative(u.lastLoginAt, now) : "Never"}</td>
              <td className="px-2 py-2">
                {!u.active ? <Badge tone="danger">Deactivated</Badge> : u.mustChangePassword ? <Badge tone="warning">Temp password</Badge> : <Badge tone="success">Active</Badge>}
              </td>
              <td className="px-2 py-2 text-right">{u.id !== admin.id && <UserActions userId={u.id} name={u.name} active={u.active} />}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
