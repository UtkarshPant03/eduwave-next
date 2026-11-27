"use client"; // Renders inside the instructor layout, so the sidebar keeps working.

import { ErrorView } from "@/components/client/error-view";

export default function InstructorError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} homeHref="/instructor" />;
}
