/**
 * Backs up the database into ./backups (or BACKUP_DIR). Run with: npm run db:backup
 *
 * - Local PGlite: a gzip copy of the whole data directory. Stop the app first: PGlite
 *   allows one process at a time, and a copy taken mid-write could be inconsistent.
 *   The backup is then opened in memory and checked, so you know it can be restored.
 * - Postgres (DATABASE_URL set): runs `pg_dump` (custom format). Needs the PostgreSQL
 *   client tools installed; the database can stay online while it runs.
 *
 * Keeps the newest BACKUP_KEEP backups (default 14) and deletes older ones.
 * Backups contain student data and password hashes: store them privately, never in git,
 * and keep a copy on another machine (a backup on the same disk doesn't survive a disk failure).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const dir = process.env.BACKUP_DIR ?? "./backups";
const keep = Math.max(1, Number(process.env.BACKUP_KEEP ?? 14));
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

// A pending promise with nothing left to run makes Node exit quietly with code 0, which a
// scheduler would record as success. Treat "stopped before finishing" as a failure.
let finished = false;
process.on("beforeExit", () => {
  if (!finished) {
    console.error("Backup FAILED: stopped unexpectedly before finishing.");
    process.exit(1);
  }
});

async function main() {
  mkdirSync(dir, { recursive: true });
  const url = process.env.DATABASE_URL;
  let file: string;

  if (url) {
    file = join(dir, `eduwave-${stamp}.dump`);
    const res = spawnSync("pg_dump", ["--format=custom", "--no-owner", `--file=${file}`, url], { stdio: "inherit" });
    if (res.error) throw new Error("pg_dump not found: install the PostgreSQL client tools (free) and try again.");
    if (res.status !== 0) throw new Error(`pg_dump exited with code ${res.status}`);
  } else {
    const dataDir = process.env.PGLITE_DIR ?? "./.pglite";
    const db = new PGlite(dataDir);
    // dumpDataDir() doesn't wait for start-up itself: without this, Node exits silently.
    await db.waitReady;
    const dump = await db.dumpDataDir("gzip");
    await db.close();
    const bytes = new Uint8Array(await dump.arrayBuffer());
    file = join(dir, `eduwave-${stamp}.tar.gz`);
    writeFileSync(file, bytes);

    // Verify: open the backup in memory and read from it.
    const check = new PGlite({ loadDataDir: new Blob([bytes]) });
    const { rows } = await check.query<{ users: number; courses: number }>(
      "select (select count(*) from users)::int as users, (select count(*) from courses)::int as courses",
    );
    await check.close();
    console.log(`Verified backup: ${rows[0].users} users, ${rows[0].courses} courses.`);
  }

  const size = (statSync(file).size / 1024 / 1024).toFixed(2);
  console.log(`Backup written: ${file} (${size} MB)`);

  // Rotation: newest first by name (names start with a sortable timestamp).
  const old = readdirSync(dir)
    .filter((f) => /^eduwave-.*\.(tar\.gz|dump)$/.test(f))
    .sort()
    .reverse()
    .slice(keep);
  for (const f of old) unlinkSync(join(dir, f));
  if (old.length) console.log(`Removed ${old.length} old backup(s); keeping the newest ${keep}.`);
}

main()
  .then(() => {
    finished = true;
  })
  .catch((err) => {
    console.error(`Backup FAILED: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
