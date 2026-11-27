import { NotFoundView } from "@/components/not-found-view";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col justify-center px-4">
      <NotFoundView homeHref="/" homeLabel="Back to eduWave" />
    </main>
  );
}
