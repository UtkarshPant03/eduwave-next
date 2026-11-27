import Link from "next/link";
import { cx } from "./ui";

/** Logo mark: a white wave on a solid navy tile (no gradients, so it renders identically everywhere). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cx("bg-brand grid size-8 shrink-0 place-items-center rounded-lg", className)} aria-hidden>
      <svg viewBox="0 0 32 32" className="size-full">
        <path d="M6 18c3-5 6-5 9 0s6 5 11-2" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M6 23c3-3 6-3 9 0s6 3 11-1" fill="none" stroke="white" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Logo({ href = "/", subtitle }: { href?: string; subtitle?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <LogoMark />
      <span className="leading-tight">
        <span className="block text-base font-semibold tracking-tight">eduWave</span>
        {subtitle && <span className="block text-xs text-muted">{subtitle}</span>}
      </span>
    </Link>
  );
}
