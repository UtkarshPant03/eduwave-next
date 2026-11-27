import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonClass } from "./ui";

/**
 * Also shown when someone opens a course they're not part of: access checks deliberately
 * answer "not found" (never "forbidden") so course and submission IDs can't be probed.
 */
export function NotFoundView({ homeHref, homeLabel }: { homeHref: string; homeLabel: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-accent/10 text-accent">
        <Compass className="size-7" />
      </span>
      <div className="max-w-md">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted">
          This page doesn&apos;t exist, or it belongs to a course you aren&apos;t part of. Check the link, or start again
          from your dashboard.
        </p>
      </div>
      <Link href={homeHref} className={buttonClass()}>{homeLabel}</Link>
    </div>
  );
}
