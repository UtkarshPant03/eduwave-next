import { KeyRound, Laptop, ShieldAlert, Smartphone, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { changePassword, signOutOtherDevices, updateProfile } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { Avatar, Badge, Button, Card, Field, Input, PageHeader, Table, Textarea } from "@/components/ui";
import { db } from "@/db";
import { requireUser, type Role } from "@/lib/auth/dal";
import { listSessions } from "@/lib/auth/session";
import { listAuditLog } from "@/lib/data/shared";
import { formatDateTime } from "@/lib/format";

const ACTION_LABEL: Record<string, string> = {
  login: "Signed in",
  login_failed: "Failed sign-in attempt",
  login_locked: "Account temporarily locked",
  logout: "Signed out",
  password_changed: "Password changed",
  password_reset: "Password reset by administrator",
  sessions_revoked: "Signed out other devices",
  user_created: "Created a user",
  course_created: "Created a course",
  user_deactivated: "Account deactivated",
  user_reactivated: "Account reactivated",
};

function describeAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return `${browser}${os ? ` on ${os}` : ""}`;
}

export async function AccountPage({ role, searchParams }: { role: Role; searchParams: Promise<{ required?: string }> }) {
  const user = await requireUser();
  if (user.role !== role) redirect(`/${user.role}/account`);
  const { required } = await searchParams;
  const [profile, sessions, activity] = await Promise.all([
    db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, user.id), columns: { name: true, email: true, studentId: true, department: true, program: true, bio: true, createdAt: true } }),
    listSessions(user.id),
    listAuditLog(user.id),
  ]);
  const failedRecently = activity.filter((a) => a.action === "login_failed").length;

  return (
    <>
      <PageHeader eyebrow="Account" title="Profile & security" />

      {(required || user.mustChangePassword) && (
        <div role="alert" className="mb-6 flex gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm animate-fade-in">
          <ShieldAlert className="size-5 shrink-0 text-warning" />
          <div>
            <p className="font-medium">Choose your own password to continue</p>
            <p className="text-muted">Your current password was issued to you. Pick a new one that only you know.</p>
          </div>
        </div>
      )}

      <div className="bg-mesh mb-6 flex flex-wrap items-center gap-5 rounded-2xl border border-border bg-surface p-6 shadow-card">
        <Avatar name={user.name} size="lg" />
        <div className="flex-1">
          <p className="text-lg font-semibold">{user.name}</p>
          <p className="text-sm text-muted">
            {profile?.email}
            {profile?.studentId && <> · <span className="font-mono">{profile.studentId}</span></>}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="accent">{user.role}</Badge>
            {profile?.department && <Badge>{profile.department}</Badge>}
            {profile?.program && <Badge>{profile.program}</Badge>}
          </div>
        </div>
        {profile && <p className="text-xs text-muted">Member since {formatDateTime(profile.createdAt)}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {!user.mustChangePassword && (
          <Card title="Profile" icon={<UserRound />} description="How others see you in courses and discussions.">
            <ActionForm action={updateProfile} submitLabel="Save profile">
              <Field label="Full name"><Input name="name" defaultValue={profile?.name} required maxLength={100} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Department"><Input name="department" defaultValue={profile?.department ?? ""} maxLength={100} /></Field>
                <Field label="Programme / title"><Input name="program" defaultValue={profile?.program ?? ""} maxLength={100} placeholder={role === "student" ? "B.Tech CSE, Year 2" : "Assistant Professor"} /></Field>
              </div>
              <Field label="About"><Textarea name="bio" defaultValue={profile?.bio ?? ""} maxLength={500} rows={3} /></Field>
            </ActionForm>
          </Card>
        )}

        <Card title="Change password" icon={<KeyRound />} description="At least 10 characters. A phrase of random words is strong and easy to remember.">
          <ActionForm action={changePassword} submitLabel="Update password">
            <Field label="Current password"><Input name="currentPassword" type="password" autoComplete="current-password" required /></Field>
            <Field label="New password"><Input name="newPassword" type="password" autoComplete="new-password" minLength={10} required /></Field>
            <Field label="Confirm new password"><Input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></Field>
          </ActionForm>
        </Card>

        <Card
          title="Active sessions"
          icon={<Laptop />}
          description="Devices currently signed in to your account."
          action={sessions.length > 1 && <form action={signOutOtherDevices}><Button variant="secondary" size="sm">Sign out others</Button></form>}
        >
          <ul className="divide-y divide-border">
            {sessions.map((s, i) => {
              const Icon = /Mobile|Android|iPhone/.test(s.userAgent ?? "") ? Smartphone : Laptop;
              return (
                <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                  <Icon className="size-4 text-muted" />
                  <span className="flex-1">
                    {describeAgent(s.userAgent)}
                    <span className="block text-xs text-muted">Signed in {formatDateTime(s.createdAt)}</span>
                  </span>
                  {s.current && <Badge tone="success">This device</Badge>}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card
          title="Recent activity"
          className="lg:col-span-2"
          description={failedRecently > 0 ? `${failedRecently} failed sign-in attempt(s) recently. If that wasn't you, change your password.` : "Sign-ins and security changes on your account."}
        >
          <Table head={["Event", "When", "IP address"]}>
            {activity.map((a, i) => (
              <tr key={i}>
                <td className="px-2 py-2">
                  {a.action === "login_failed" || a.action === "login_locked" ? <Badge tone="danger">{ACTION_LABEL[a.action]}</Badge> : (ACTION_LABEL[a.action] ?? a.action)}
                </td>
                <td className="px-2 py-2 text-muted">{formatDateTime(a.createdAt)}</td>
                <td className="px-2 py-2 font-mono text-xs text-muted">{a.ip}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
