"use client";

import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { buttonClass } from "@/components/ui";

/**
 * Shared fallback for error.tsx boundaries.
 *
 * In production, errors from Server Components arrive with a generic message and a
 * `digest` (a hash that also appears in the server log), so no internals such as SQL or
 * file paths ever reach the browser. We show the digest as a support reference.
 */
export function ErrorView({ error, retry, homeHref = "/" }: { error: unknown; retry: () => void; homeHref?: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-danger/10 text-danger">
        <TriangleAlert className="size-7" />
      </span>
      <div>
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">
          This page couldn&apos;t be loaded. It may be a temporary problem, so try again. If it keeps happening, contact
          your administrator{digest ? " and quote the reference below" : ""}.
        </p>
        {digest && (
          <p className="mt-3 text-xs text-muted">
            Reference: <code className="rounded bg-surface-2 px-1.5 py-0.5">{digest}</code>
          </p>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className={buttonClass()} onClick={() => retry()}>
          <RotateCcw className="size-4" /> Try again
        </button>
        <Link href={homeHref} className={buttonClass("secondary")}>
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
