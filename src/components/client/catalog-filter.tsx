"use client";

import { Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Input } from "@/components/ui";

/** Client-side search + department filter over server-rendered course cards. */
export function CatalogFilter({ items, departments }: { items: { key: string; department: string; text: string; node: ReactNode }[]; departments: string[] }) {
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("all");
  const query = q.trim().toLowerCase();
  const visible = items.filter((i) => (dept === "all" || i.department === dept) && (!query || i.text.toLowerCase().includes(query)));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by code, title or instructor" className="pl-9" aria-label="Search courses" />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by department">
          {["all", ...departments].map((d) => (
            <button
              key={d}
              onClick={() => setDept(d)}
              aria-pressed={dept === d}
              className={`rounded-full border px-3 py-1 text-xs transition ${dept === d ? "bg-brand border-transparent text-white" : "border-border text-muted hover:text-foreground"}`}
            >
              {d === "all" ? "All departments" : d}
            </button>
          ))}
        </div>
      </div>
      {visible.length ? (
        <ul className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((i) => <li key={i.key}>{i.node}</li>)}
        </ul>
      ) : (
        <p className="py-10 text-center text-sm text-muted">No courses match.</p>
      )}
    </div>
  );
}
