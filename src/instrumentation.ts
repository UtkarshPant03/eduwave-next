/**
 * Runs once when the server starts, before it accepts any request (Next.js convention).
 * The checks live in a Node-only module (see src/lib/startup-checks.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runStartupChecks } = await import("./lib/startup-checks");
    await runStartupChecks();
  }
}

/** Server errors in one structured line each (the digest matches the reference shown to users). */
export async function onRequestError(error: unknown, request: { path: string; method: string }) {
  const err = error as { message?: string; digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      at: new Date().toISOString(),
      method: request.method,
      path: request.path.split("?")[0], // never log query strings (they can carry tokens)
      digest: err.digest,
      message: err.message,
    }),
  );
}
