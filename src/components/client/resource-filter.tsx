"use client";

import { Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Input } from "@/components/ui";

/**
 * Client-side search + subject filter over server-rendered resource cards.
 * Each card is passed in with its searchable text, so no data is re-fetched.
 */
export function ResourceFilter({ items, subjects }: { items: { key: string; subject: string; text: string; node: ReactNode }[]; subjects: string[] }) {
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("all");
  const query = q.trim().toLowerCase();
  const visible = items.filter((i) => (subject === "all" || i.subject === subject) && (!query || i.text.toLowerCase().includes(query)));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search resources" className="pl-9" aria-label="Search resources" />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by subject">
          {["all", ...subjects].map((s) => (
            <button
              key={s}
              onClick={() => setSubject(s)}
              aria-pressed={subject === s}
              className={`rounded-full border px-3 py-1 text-xs ${subject === s ? "border-accent bg-accent text-accent-foreground" : "border-border text-muted hover:text-foreground"}`}
            >
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
      </div>
      {visible.length ? <ul className="grid gap-2">{visible.map((i) => <li key={i.key}>{i.node}</li>)}</ul> : <p className="py-6 text-center text-sm text-muted">No matching resources.</p>}
    </div>
  );
}
