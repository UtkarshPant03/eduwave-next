import { AppShell } from "@/components/app-shell";

export default function StudentLayout({ children }: LayoutProps<"/student">) {
  return (
    <AppShell
      home="/student"
      links={[
        { href: "/student", label: "Dashboard", icon: "dashboard" },
        { href: "/student/stats", label: "My progress", icon: "stats" },
        { href: "/student/leaderboard", label: "Leaderboard", icon: "trophy" },
        { href: "/student/resources", label: "Resources", icon: "book" },
        { href: "/student/live", label: "Live classes", icon: "video" },
        { href: "/student/tutor", label: "AI tutor", icon: "bot" },
        { href: "/student/boards", label: "Whiteboards", icon: "board" },
        { href: "/student/account", label: "Account & security", icon: "shield" },
      ]}
    >
      {children}
    </AppShell>
  );
}
