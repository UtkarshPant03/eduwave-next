"use client";

import { ChevronDown, UserCog } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Avatar button with a dropdown (account link + logout form passed from the server). */
export function UserMenu({ avatar, name, role, accountHref, logout }: { avatar: ReactNode; name: string; role: string; accountHref: string; logout: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-surface-2" aria-expanded={open} aria-label="Account menu">
        {avatar}
        <ChevronDown className={`size-3.5 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 animate-pop rounded-2xl border border-border bg-surface p-2 shadow-card-lg">
          <div className="border-b border-border px-3 pb-3 pt-1">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="text-xs capitalize text-muted">{role}</p>
          </div>
          <Link href={accountHref} onClick={() => setOpen(false)} className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-surface-2">
            <UserCog className="size-4 text-muted" /> Profile & security
          </Link>
          {logout}
        </div>
      )}
    </div>
  );
}
