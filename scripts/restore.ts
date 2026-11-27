/**
 * Restores a backup made by `npm run db:backup`. Stop the app first.
 *
 *   npm run db:restore -- backups/eduwave-2026-11-27T10-00-00.tar.gz          (PGlite)
 *   npm run db:restore -- backups/eduwave-2026-11-27T10-00-00.dump --yes      (Postgres)
 *
 * - PGlite: the current data directory is NOT deleted; it is renamed to
 *   `<dir>.before-restore-<timestamp>`, so a mistaken restore can be undone.
 * - Postgres: replaces the tables in DATABASE_URL with the backup's (pg_restore --clean).
 *   That overwrites live data, so it requires --yes.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const [file, ...flags] = process.argv.slice(2);
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

// A pending promise with nothing left to run makes Node exit quietly with code 0, which a
// scheduler would record as success. Treat "stopped before finishing" as a failure.
let finished = false;
process.on("beforeExit", () => {
  if (!finished) {
    console.error("Restore FAILED: stopped unexpectedly before finishing.");
    process.exit(1);
  }
});

async function main() {
  if (!file || !existsSync(file)) throw new Error("Give the path of a backup file, e.g. npm run db:restore -- backups/eduwave-….tar.gz");
  const url = process.env.DATABASE_URL;

  if (url) {
    if (!file.endsWith(".dump")) throw new Error("DATABASE_URL is set, so expected a .dump file made by pg_dump.");
    if (!flags.includes("--yes")) throw new Error("This replaces the data in DATABASE_URL. Re-run with --yes to confirm.");
    const res = spawnSync("pg_restore", ["--clean", "--if-exists", "--no-owner", `--dbname=${url}`, file], { stdio: "inherit" });
    if (res.error) throw new Error("pg_restore not found: install the PostgreSQL client tools (free) and try again.");
    if (res.status !== 0) throw new Error(`pg_restore exited with code ${res.status}`);
    console.log("Restored into the Postgres database.");
    return;
  }

  if (!file.endsWith(".tar.gz")) throw new Error("Expected a .tar.gz backup of a PGlite database.");
  const dataDir = process.env.PGLITE_DIR ?? "./.pglite";
  const blob = new Blob([readFileSync(file)]);

  // Check the backup opens BEFORE touching the current data.
  const probe = new PGlite({ loadDataDir: blob });
  await probe.query("select 1 from users limit 1");
  await probe.close();

  if (existsSync(dataDir)) {
    const aside = `${dataDir.replace(/[\\/]+$/, "")}.before-restore-${stamp}`;
    renameSync(dataDir, aside);
    console.log(`Current database moved aside to ${aside} (delete it once you're happy).`);
  }
  const db = new PGlite({ dataDir, loadDataDir: blob });
  const { rows } = await db.query<{ users: number; courses: number }>(
    "select (select count(*) from users)::int as users, (select count(*) from courses)::int as courses",
  );
  await db.close();
  console.log(`Restored ${file} into ${dataDir}: ${rows[0].users} users, ${rows[0].courses} courses.`);
}

main()
  .then(() => {
    finished = true;
  })
  .catch((err) => {
    console.error(`Restore FAILED: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
