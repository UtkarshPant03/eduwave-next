import Link from "next/link";
import { cx } from "./ui";

/** Logo mark: a wave inside a rounded square, drawn in SVG (scales crisply, themes via CSS). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cx("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#logo-g)" />
      <path d="M6 18c3-5 6-5 9 0s6 5 11-2" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M6 23c3-3 6-3 9 0s6 3 11-1" fill="none" stroke="white" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ href = "/", subtitle }: { href?: string; subtitle?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="eduWave home">
      <LogoMark />
      <span className="leading-tight">
        <span className="block text-[17px] font-semibold tracking-tight">
          edu<span className="text-gradient">Wave</span>
        </span>
        {subtitle && <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-muted">{subtitle}</span>}
      </span>
    </Link>
  );
}
