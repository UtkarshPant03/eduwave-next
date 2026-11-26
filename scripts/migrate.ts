/**
 * Applies the SQL migrations in ./drizzle to whichever database is configured.
 * Run with: npm run db:migrate
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";

const migrationsFolder = "./drizzle";

async function main() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const db = drizzlePg(url);
    await migratePg(db, { migrationsFolder });
    await db.$client.end();
    console.log("Migrated Postgres database.");
  } else {
    const client = new PGlite(process.env.PGLITE_DIR ?? "./.pglite");
    await migratePglite(drizzlePglite(client), { migrationsFolder });
    await client.close();
    console.log("Migrated local PGlite database in ./.pglite");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
