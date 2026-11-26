import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth/dal";
import { NavLink } from "./nav-link";
import { PageSkeleton } from "./ui";

/**
 * Layout chrome for signed-in areas. The nav is static and prerenders instantly;
 * only the user's name and the page content wait for the session (behind Suspense).
 */
export function AppShell({
  home,
  links,
  children,
}: {
  home: string;
  links: { href: string; label: string }[];
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href={home} className="text-lg font-semibold tracking-tight">
            edu<span className="text-accent">Wave</span>
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1">
            {/* usePathname() is request data on dynamic routes, so the active highlight
                streams in; the fallback renders the same links without it. */}
            <Suspense fallback={links.map((l) => <NavLink key={l.href} href={l.href} static>{l.label}</NavLink>)}>
              {links.map((l) => (
                <NavLink key={l.href} href={l.href}>
                  {l.label}
                </NavLink>
              ))}
            </Suspense>
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <Suspense fallback={<span className="text-muted">…</span>}>
              <UserName />
            </Suspense>
            <form action={logout}>
              <button className="text-muted hover:text-foreground">Log out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
      </main>
    </div>
  );
}

async function UserName() {
  const user = await getCurrentUser();
  return <span className="text-muted">{user?.name}</span>;
}
