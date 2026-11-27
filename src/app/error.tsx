"use client"; // Error boundaries must be Client Components

import { ErrorView } from "@/components/client/error-view";

export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="flex flex-1 flex-col px-4">
      <ErrorView error={error} retry={retry} homeHref="/" />
    </main>
  );
}
