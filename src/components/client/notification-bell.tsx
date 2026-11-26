"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/notifications";

type Item = { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };

const POLL_MS = 30_000;

/**
 * Polls for notifications every 30 s while the tab is visible. Polling is simple and
 * works on any host (incl. serverless); WebSockets/SSE are the upgrade path.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ unread: number; items: Item[] }>({ unread: 0, items: [] });
  const seen = useRef<Set<string> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const next: { unread: number; items: Item[] } = await res.json();
      // Toast only for notifications that arrived after the first load.
      if (seen.current) {
        for (const n of next.items) if (!seen.current.has(n.id) && !n.readAt) toast(n.title, { description: n.body ?? undefined });
      }
      seen.current = new Set(next.items.map((n) => n.id));
      setData(next);
    } catch {}
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch from an external API
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !panelRef.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function readAll() {
    setData((d) => ({ unread: 0, items: d.items.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })) }));
    await markAllNotificationsRead();
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
        aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ""}`}
        aria-expanded={open}
      >
        <Bell className="size-4" />
        {data.unread > 0 && (
          <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white animate-pop">
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] animate-pop rounded-xl border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {data.unread > 0 && (
              <button onClick={readAll} className="flex items-center gap-1 text-xs text-accent hover:underline">
                <CheckCheck className="size-3.5" /> Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {data.items.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">You&apos;re all caught up.</li>}
            {data.items.map((n) => (
              <li key={n.id} className="border-b border-border last:border-0">
                <Link
                  href={n.link ?? "#"}
                  onClick={() => {
                    setOpen(false);
                    if (!n.readAt) {
                      setData((d) => ({ unread: Math.max(0, d.unread - 1), items: d.items.map((i) => (i.id === n.id ? { ...i, readAt: "now" } : i)) }));
                      markNotificationRead(n.id);
                    }
                  }}
                  className="flex gap-3 px-4 py-3 hover:bg-surface-2"
                >
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-accent"}`} aria-hidden />
                  <span className="min-w-0">
                    <span className={`block text-sm ${n.readAt ? "text-muted" : "font-medium"}`}>{n.title}</span>
                    {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                    <span className="block text-xs text-muted">{new Date(n.createdAt).toLocaleString()}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
