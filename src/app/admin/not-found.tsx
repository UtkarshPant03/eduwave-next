import { NotFoundView } from "@/components/not-found-view";

// Rendered inside the admin layout, so the sidebar and header stay available.
export default function AdminNotFound() {
  return <NotFoundView homeHref="/admin" homeLabel="Go to dashboard" />;
}
