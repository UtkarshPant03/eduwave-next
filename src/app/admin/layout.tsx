import { AppShell } from "@/components/app-shell";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AppShell
      role="admin"
      links={[
        { href: "/admin", label: "Overview", icon: "dashboard" },
        { href: "/admin/users", label: "Users", icon: "users", group: "Manage" },
        { href: "/admin/courses", label: "Courses", icon: "courses", group: "Manage" },
        { href: "/admin/audit", label: "Audit log", icon: "log", group: "Manage" },
        { href: "/admin/account", label: "Profile & security", icon: "shield", group: "You" },
      ]}
    >
      {children}
    </AppShell>
  );
}
