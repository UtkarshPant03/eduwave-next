"use client"; // Renders inside the student layout, so the sidebar keeps working.

import { ErrorView } from "@/components/client/error-view";

export default function StudentError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} homeHref="/student" />;
}
