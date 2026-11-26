import { AppShell } from "@/components/app-shell";

export default function StudentLayout({ children }: LayoutProps<"/student">) {
  return (
    <AppShell
      home="/student"
      links={[
        { href: "/student", label: "Quizzes" },
        { href: "/student/stats", label: "My stats" },
        { href: "/student/leaderboard", label: "Leaderboard" },
        { href: "/student/resources", label: "Resources" },
      ]}
    >
      {children}
    </AppShell>
  );
}
