import { AppShell } from "@/components/app-shell";

export default function StudentLayout({ children }: LayoutProps<"/student">) {
  return (
    <AppShell
      role="student"
      links={[
        { href: "/student", label: "Dashboard", icon: "dashboard" },
        { href: "/student/courses", label: "My courses", icon: "courses", group: "Learning" },
        { href: "/student/catalog", label: "Course catalogue", icon: "catalog", group: "Learning" },
        { href: "/student/grades", label: "Grades", icon: "grades", group: "Learning" },
        { href: "/student/calendar", label: "Calendar", icon: "calendar", group: "Learning" },
        { href: "/student/tutor", label: "AI tutor", icon: "bot", group: "Tools" },
        { href: "/student/boards", label: "Whiteboards", icon: "board", group: "Tools" },
        { href: "/student/account", label: "Profile & security", icon: "shield", group: "You" },
      ]}
    >
      {children}
    </AppShell>
  );
}
