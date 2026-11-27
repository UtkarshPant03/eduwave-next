import Link from "next/link";
import { cx } from "./ui";

/**
 * Logo mark: a wave on a gradient tile. The tile is a CSS gradient rather than an SVG
 * <linearGradient>: an SVG gradient referenced by id stops rendering when the element that
 * defines it is display:none (e.g. the desktop sidebar on phones).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cx("bg-brand grid size-8 shrink-0 place-items-center rounded-[9px]", className)} aria-hidden>
      <svg viewBox="0 0 32 32" className="size-full">
        <path d="M6 18c3-5 6-5 9 0s6 5 11-2" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M6 23c3-3 6-3 9 0s6 3 11-1" fill="none" stroke="white" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
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
