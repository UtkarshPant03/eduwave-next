import { NotFoundView } from "@/components/not-found-view";

// Rendered inside the instructor layout, so the sidebar and header stay available.
export default function InstructorNotFound() {
  return <NotFoundView homeHref="/instructor" homeLabel="Go to dashboard" />;
}
