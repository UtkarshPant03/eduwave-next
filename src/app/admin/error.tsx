"use client"; // Renders inside the admin layout, so the sidebar keeps working.

import { ErrorView } from "@/components/client/error-view";

export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} homeHref="/admin" />;
}
