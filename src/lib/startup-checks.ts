/**
 * Production safety checks, run once at server start (Node.js runtime only; loaded by
 * src/instrumentation.ts). Refuse to start with an unsafe configuration or with the
 * published sample accounts in the database: failing loudly at startup is far better
 * than discovering weeks later that grades went to a throwaway local database.
 */
import { configurationProblems, deploymentMode } from "@/lib/env";

export async function runStartupChecks() {
  const problems = configurationProblems();
  if (problems.length === 0 && deploymentMode() === "production") {
    const { sampleAccountsPresent } = await import("@/lib/sample-data");
    if (await sampleAccountsPresent())
      problems.push(
        "The database contains the published sample accounts (from `npm run db:seed`). Their password is public. Use a fresh database for production.",
      );
  }
  if (problems.length > 0) {
    console.error(`\neduWave refused to start (${deploymentMode()} mode):\n  - ${problems.join("\n  - ")}\n`);
    process.exit(1);
  }
}
