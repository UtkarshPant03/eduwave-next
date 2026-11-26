import { AppShell } from "@/components/app-shell";

export default function InstructorLayout({ children }: LayoutProps<"/instructor">) {
  return (
    <AppShell
      role="instructor"
      links={[
        { href: "/instructor", label: "Dashboard", icon: "dashboard" },
        { href: "/instructor/courses", label: "My courses", icon: "courses", group: "Teaching" },
        { href: "/instructor/calendar", label: "Calendar", icon: "calendar", group: "Teaching" },
        { href: "/instructor/boards", label: "Whiteboards", icon: "board", group: "Tools" },
        { href: "/instructor/account", label: "Profile & security", icon: "shield", group: "You" },
      ]}
    >
      {children}
    </AppShell>
  );
}
