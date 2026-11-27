"use client";

import {
  BarChart3,
  Bot,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  Library,
  LayoutDashboard,
  Menu,
  PenTool,
  ScrollText,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Icons are mapped here because components can't be passed from Server to Client Components.
const ICONS = {
  dashboard: LayoutDashboard,
  courses: BookOpen,
  catalog: Library,
  grades: ClipboardCheck,
  calendar: CalendarDays,
  stats: BarChart3,
  board: PenTool,
  bot: Bot,
  shield: ShieldCheck,
  users: Users,
  school: GraduationCap,
  log: ScrollText,
};
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; group?: string };

function NavLinks({ links, pathname, onNavigate }: { links: NavItem[]; pathname: string | null; onNavigate?: () => void }) {
  return (
    <ul className="grid gap-0.5">
      {links.map((l, i) => {
        const Icon = ICONS[l.icon];
        const active = pathname != null && (pathname === l.href || (l.href.split("/").length > 2 && pathname.startsWith(l.href)));
        // Show a group heading when the group changes from the previous link.
        const heading = l.group && l.group !== links[i - 1]?.group ? l.group : null;
        return (
          <li key={l.href}>
            {heading && <p className="mb-1 mt-4 px-3 text-xs font-semibold text-muted">{heading}</p>}
            <Link
              href={l.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-9 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active ? "bg-surface-2 font-medium text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              {active && <span className="bg-brand absolute inset-y-1.5 left-0 w-[3px] rounded-full" aria-hidden />}
              <Icon className="size-4" aria-hidden />
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Pathname-dependent highlight; rendered inside Suspense by the shell. */
export function ActiveNav({ links }: { links: NavItem[] }) {
  return <NavLinks links={links} pathname={usePathname()} />;
}

/** Same links with no active state: the prerendered fallback. */
export function StaticNav({ links }: { links: NavItem[] }) {
  return <NavLinks links={links} pathname={null} />;
}

/** Hamburger + slide-in drawer for small screens. */
export function MobileNav({ links, header, footer }: { links: NavItem[]; header?: ReactNode; footer?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button onClick={() => setOpen(true)} className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 lg:hidden" aria-label="Open menu" aria-expanded={open}>
        <Menu className="size-5" />
      </button>
      {/* Portal to <body>: the sticky header uses backdrop-filter, which would otherwise
          become the containing block for this fixed overlay and clip it to the header. */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <nav className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto border-r border-border bg-surface p-4 shadow-card-lg">
              <div className="flex items-center justify-between">
                {header}
                <button onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-xl hover:bg-surface-2" aria-label="Close menu">
                  <X className="size-5" />
                </button>
              </div>
              <NavLinks links={links} pathname={pathname} onNavigate={() => setOpen(false)} />
              <div className="mt-auto">{footer}</div>
            </nav>
          </div>,
          document.body,
        )}
    </>
  );
}
