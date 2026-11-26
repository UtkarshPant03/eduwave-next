import { AppShell } from "@/components/app-shell";

export default function TeacherLayout({ children }: LayoutProps<"/teacher">) {
  return (
    <AppShell
      home="/teacher"
      links={[
        { href: "/teacher", label: "Dashboard", icon: "dashboard" },
        { href: "/teacher/live", label: "Live classes", icon: "video" },
        { href: "/teacher/boards", label: "Whiteboards", icon: "board" },
        { href: "/teacher/account", label: "Account & security", icon: "shield" },
      ]}
    >
      {children}
    </AppShell>
  );
}
