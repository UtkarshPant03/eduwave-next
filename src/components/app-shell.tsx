import { LogOut } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth/dal";
import { Logo } from "./brand";
import { CommandPalette, PaletteButton } from "./client/command-palette";
import { NotificationBell } from "./client/notification-bell";
import { ActiveNav, MobileNav, StaticNav, type NavItem } from "./client/sidebar-nav";
import { ThemeToggle } from "./client/theme-toggle";
import { UserMenu } from "./client/user-menu";
import { Avatar, PageSkeleton } from "./ui";

const ROLE_LABEL = { admin: "Administration", instructor: "Instructor", student: "Student" } as const;

/**
 * Layout chrome for signed-in areas. The sidebar is static and prerenders instantly;
 * only the user menu, the active highlight and the page content wait for the
 * request (each behind its own Suspense boundary).
 */
export function AppShell({ role, links, children }: { role: keyof typeof ROLE_LABEL; links: NavItem[]; children: ReactNode }) {
  const home = `/${role}`;
  const logoutForm = (
    <form action={logout}>
      <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-foreground">
        <LogOut className="size-4" /> Sign out
      </button>
    </form>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col gap-6 border-r border-border bg-surface/70 px-3 py-5 backdrop-blur lg:flex">
        <div className="px-2">
          <Logo href={home} subtitle={ROLE_LABEL[role]} />
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto">
          <Suspense fallback={<StaticNav links={links} />}>
            <ActiveNav links={links} />
          </Suspense>
        </nav>
        <div className="rounded-2xl border border-border bg-surface-2/60 p-3 text-xs text-muted">
          <p className="font-medium text-foreground">Tip</p>
          Press <kbd className="rounded border border-border bg-surface px-1">Ctrl</kbd> + <kbd className="rounded border border-border bg-surface px-1">K</kbd> to jump anywhere.
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-border bg-surface/80 px-4 py-2.5 backdrop-blur-md sm:px-6">
          <Suspense fallback={<span className="size-9 lg:hidden" />}>
            <MobileNav links={links} header={<Logo href={home} />} footer={logoutForm} />
          </Suspense>
          <div className="lg:hidden">
            <Logo href={home} />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <PaletteButton />
            <NotificationBell />
            <ThemeToggle />
            <Suspense fallback={<span className="size-9" />}>
              <HeaderUser role={role} logoutForm={logoutForm} />
            </Suspense>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
        </main>
        <footer className="border-t border-border px-6 py-4 text-center text-xs text-muted">
          eduWave Learning Management System · Built with open-source software
        </footer>
      </div>
      <CommandPalette links={links} />
    </div>
  );
}

async function HeaderUser({ role, logoutForm }: { role: string; logoutForm: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return null;
  return <UserMenu avatar={<Avatar name={user.name} size="sm" />} name={user.name} role={user.role} accountHref={`/${role}/account`} logout={logoutForm} />;
}
