import { AppShell } from "@/components/app-shell";

export default function TeacherLayout({ children }: LayoutProps<"/teacher">) {
  return (
    <AppShell home="/teacher" links={[{ href: "/teacher", label: "Classes" }]}>
      {children}
    </AppShell>
  );
}
