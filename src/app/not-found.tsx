import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-muted">
        This page doesn&apos;t exist, or it belongs to another class.
      </p>
      <Link href="/" className="mt-6 text-sm text-accent underline">Go home</Link>
    </main>
  );
}
