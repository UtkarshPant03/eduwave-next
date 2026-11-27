import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonClass } from "@/components/ui";

/**
 * Also shown when someone opens a course they're not enrolled in: access checks
 * deliberately answer 404 (not 403) so course and submission IDs can't be probed.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
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
      <Link href="/" className={buttonClass()}>Back to eduWave</Link>
    </main>
  );
}
