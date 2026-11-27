import { PageSkeleton } from "@/components/ui";

// Shown instantly on navigation while the page's per-user data streams in.
export default function Loading() {
  return <PageSkeleton />;
}
