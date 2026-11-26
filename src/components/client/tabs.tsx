"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Tabs whose panels are rendered on the server and passed in. Switching tabs is
 * instant (no request); the active tab is mirrored in the URL hash so links and
 * reloads keep it. Implements the WAI-ARIA tabs pattern (arrow keys move between tabs).
 */
export function Tabs({ tabs }: { tabs: { id: string; label: ReactNode; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (tabs.some((t) => t.id === id)) setActive(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);

  function select(id: string) {
    setActive(id);
    history.replaceState(null, "", `#${id}`);
  }

  return (
    <div>
      <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => select(t.id)}
            onKeyDown={(e) => {
              const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!dir) return;
              const next = tabs[(i + dir + tabs.length) % tabs.length];
              select(next.id);
              document.getElementById(`tab-${next.id}`)?.focus();
            }}
            className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition ${
              active === t.id ? "border-accent font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={active !== t.id} className="animate-fade-in">
          {t.content}
        </div>
      ))}
    </div>
  );
}
