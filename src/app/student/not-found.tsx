import { NotFoundView } from "@/components/not-found-view";

// Rendered inside the student layout, so the sidebar and header stay available.
export default function StudentNotFound() {
  return <NotFoundView homeHref="/student" homeLabel="Go to dashboard" />;
}
