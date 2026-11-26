import Link from "next/link";
import { LogOut } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth/dal";
import { NotificationBell } from "./client/notification-bell";
import { ActiveNav, MobileNav, StaticNav, type NavItem } from "./client/sidebar-nav";
import { ThemeToggle } from "./client/theme-toggle";
import { Avatar, PageSkeleton } from "./ui";

/**
 * Layout chrome for signed-in areas. The sidebar is static and prerenders instantly;
 * only the user's name, the active highlight and the page content wait for the
 * request (each behind its own Suspense boundary).
 */
export function AppShell({ home, links, children }: { home: string; links: NavItem[]; children: ReactNode }) {
  const logoutForm = (
    <form action={logout}>
      <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-foreground">
        <LogOut className="size-4" /> Log out
      </button>
    </form>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col gap-6 border-r border-border bg-surface p-4 lg:flex">
        <Link href={home} className="px-3 text-xl font-semibold tracking-tight">
          edu<span className="text-accent">Wave</span>
        </Link>
        <nav aria-label="Main">
          <Suspense fallback={<StaticNav links={links} />}>
            <ActiveNav links={links} />
          </Suspense>
        </nav>
        <div className="mt-auto grid gap-2">
          <Suspense fallback={<div className="h-12" />}>
            <UserCard />
          </Suspense>
          {logoutForm}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-border bg-surface/85 px-4 py-2 backdrop-blur">
          <Suspense fallback={<span className="size-9 lg:hidden" />}>
            <MobileNav links={links} footer={logoutForm} />
          </Suspense>
          <Link href={home} className="text-lg font-semibold lg:hidden">
            edu<span className="text-accent">Wave</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
          <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}

async function UserCard() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2">
      <Avatar name={user.name} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="text-xs capitalize text-muted">{user.role}</p>
      </div>
    </div>
  );
}
