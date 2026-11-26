import { KeyRound, Laptop, ShieldAlert, Smartphone } from "lucide-react";
import { redirect } from "next/navigation";
import { changePassword, signOutOtherDevices } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, Field, Input, PageHeader, Table } from "@/components/ui";
import { listAuditLog } from "@/lib/data";
import { requireUser } from "@/lib/auth/dal";
import { listSessions } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";

const ACTION_LABEL: Record<string, string> = {
  login: "Signed in",
  login_failed: "Failed sign-in attempt",
  login_locked: "Account temporarily locked",
  logout: "Signed out",
  password_changed: "Password changed",
  password_reset_by_teacher: "Password reset by teacher",
  sessions_revoked: "Signed out other devices",
  teacher_registered: "Account created",
};

function describeAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return `${browser}${os ? ` on ${os}` : ""}`;
}

export async function AccountPage({ role, searchParams }: { role: "teacher" | "student"; searchParams: Promise<{ required?: string }> }) {
  const user = await requireUser();
  if (user.role !== role) redirect(`/${user.role}/account`);
  const { required } = await searchParams;
  const [sessions, activity] = await Promise.all([listSessions(user.id), listAuditLog(user.id)]);
  const failedRecently = activity.filter((a) => a.action === "login_failed").length;

  return (
    <>
      <PageHeader title="Account & security" subtitle={`Signed in as ${user.name}`} />

      {(required || user.mustChangePassword) && (
        <div role="alert" className="mb-6 flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <ShieldAlert className="size-5 shrink-0 text-warning" />
          <div>
            <p className="font-medium">Choose your own password to continue</p>
            <p className="text-muted">Your current password was issued by your teacher. Pick a new one that only you know.</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><KeyRound className="size-4" /> Change password</span>} description="At least 10 characters. A short phrase of random words is strong and easy to remember.">
          <ActionForm action={changePassword} submitLabel="Update password">
            <Field label="Current password">
              <Input name="currentPassword" type="password" autoComplete="current-password" required />
            </Field>
            <Field label="New password">
              <Input name="newPassword" type="password" autoComplete="new-password" minLength={10} required />
            </Field>
            <Field label="Confirm new password">
              <Input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required />
            </Field>
          </ActionForm>
        </Card>

        <Card
          title="Active sessions"
          description="Devices currently signed in to your account."
          action={
            sessions.length > 1 && (
              <form action={signOutOtherDevices}>
                <Button variant="secondary" size="sm">Sign out others</Button>
              </form>
            )
          }
        >
          <ul className="divide-y divide-border">
            {sessions.map((s, i) => {
              const mobile = /Mobile|Android|iPhone/.test(s.userAgent ?? "");
              const Icon = mobile ? Smartphone : Laptop;
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
          description={
            failedRecently > 0
              ? `${failedRecently} failed sign-in attempt(s) recently. If that wasn't you, change your password.`
              : "Sign-ins and security changes on your account."
          }
        >
          <Table head={["Event", "When", "IP address"]}>
            {activity.map((a, i) => (
              <tr key={i}>
                <td className="px-2 py-2">
                  {a.action === "login_failed" || a.action === "login_locked" ? (
                    <Badge tone="danger">{ACTION_LABEL[a.action]}</Badge>
                  ) : (
                    ACTION_LABEL[a.action] ?? a.action
                  )}
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
