"use client";

/**
 * Last-resort boundary: replaces the root layout when it fails, so our global CSS is
 * not loaded. Keep this page self-contained (inline styles, own <html>/<body>).
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", colorScheme: "light dark" }}>
        <title>Something went wrong · eduWave</title>
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 22 }}>eduWave is having trouble</h1>
          <p style={{ opacity: 0.75, fontSize: 14, lineHeight: 1.5 }}>
            The site couldn&apos;t load. Please try again in a moment. If the problem continues, contact your administrator
            {digest ? <> and quote reference <code>{digest}</code></> : null}.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: 12, padding: "8px 16px", borderRadius: 10, border: 0, background: "#3b4fd8", color: "#fff", fontSize: 14, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
