"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Props = { href: string; children: ReactNode; static?: boolean };

export function NavLink(props: Props) {
  return props.static ? <StyledLink {...props} active={false} /> : <ActiveNavLink {...props} />;
}

function ActiveNavLink(props: Props) {
  const pathname = usePathname();
  // Exact match for section roots (/teacher), prefix match for deeper pages.
  const active = pathname === props.href || (props.href.split("/").length > 2 && pathname.startsWith(props.href));
  return <StyledLink {...props} active={active} />;
}

function StyledLink({ href, children, active }: Props & { active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-3 py-1.5 text-sm ${active ? "bg-background font-medium" : "text-muted hover:text-foreground"}`}
    >
      {children}
    </Link>
  );
}
