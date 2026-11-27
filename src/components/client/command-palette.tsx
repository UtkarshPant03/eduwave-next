"use client";

import { ArrowRight, BookOpen, CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NavItem } from "./sidebar-nav";

type Entry = { label: string; hint: string; href: string; kind: "page" | "course" };

/**
 * Ctrl/⌘+K command palette: jump to any page or course by typing.
 * Courses are fetched lazily from /api/palette the first time it opens.
 */
export function CommandPalette({ links }: { links: NavItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [courses, setCourses] = useState<Entry[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 10);
    if (courses === null) {
      fetch("/api/palette")
        .then((r) => (r.ok ? r.json() : { courses: [] }))
        .then((d: { courses: Entry[] }) => setCourses(d.courses))
        .catch(() => setCourses([]));
    }
  }, [open, courses]);

  const entries = useMemo(() => {
    const all: Entry[] = [...links.map((l) => ({ label: l.label, hint: "Page", href: l.href, kind: "page" as const })), ...(courses ?? [])];
    const q = query.trim().toLowerCase();
    return q ? all.filter((e) => `${e.label} ${e.hint}`.toLowerCase().includes(q)) : all;
  }, [links, courses, query]);

  function go(e: Entry | undefined) {
    if (!e) return;
    setOpen(false);
    setQuery("");
    router.push(e.href);
  }

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-card-lg animate-pop">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, entries.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") go(entries[active]);
              else if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Search pages and courses…"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
          <kbd className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted">Esc</kbd>
        </div>
        <ul id="palette-list" role="listbox" className="max-h-80 overflow-y-auto p-2">
          {entries.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No matches.</li>}
          {entries.map((e, i) => (
            <li key={e.href} role="option" aria-selected={i === active}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(e)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm ${i === active ? "bg-accent/10 text-accent" : ""}`}
              >
                {e.kind === "course" ? <BookOpen className="size-4" /> : <ArrowRight className="size-4" />}
                <span className="flex-1 truncate">{e.label}</span>
                <span className="text-xs text-muted">{e.hint}</span>
                {i === active && <CornerDownLeft className="size-3.5 text-muted" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

/** Header button that opens the palette (and shows the shortcut). */
export function PaletteButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("open-palette"))}
      className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 text-sm text-muted transition hover:border-accent/40 hover:text-foreground"
      // The accessible name comes from the visible text ("Search…"), so voice-control users can
      // say what they see. On phones the text is visually hidden but still read out.
      aria-keyshortcuts="Control+K"
    >
      <Search className="size-4" aria-hidden />
      <span className="sr-only sm:not-sr-only">Search…</span>
      <kbd aria-hidden className="hidden rounded-md border border-border px-1.5 text-[10px] sm:inline">Ctrl K</kbd>
    </button>
  );
}
