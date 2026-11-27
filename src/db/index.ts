/**
 * Database connection.
 *
 * - DATABASE_URL set (e.g. Neon, Supabase, local Postgres): uses node-postgres.
 * - DATABASE_URL unset: uses PGlite, a real Postgres compiled to WASM that keeps
 *   its data in ./.pglite. Zero setup for local development and teaching labs.
 *
 * Both expose the same Drizzle API, so the rest of the app doesn't care which one runs.
 * Note: PGlite allows a single process to open the data directory at a time, so
 * stop `npm run dev` before running `npm run db:migrate` or `npm run db:seed`.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { deploymentMode } from "@/lib/env";
import * as schema from "./schema";

// Shared base type of both drivers, so callers get one consistent API.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (url) {
    return drizzlePg(url, { schema, casing: "snake_case" });
  }
  // Never fall back to the local database in production: grades would be written to a
  // throwaway directory and lost on the next deploy. (instrumentation.ts also checks this
  // at startup; this guard covers scripts and any other entry point.)
  if (deploymentMode() === "production") {
    throw new Error("DATABASE_URL is not set. Production requires PostgreSQL (set EDUWAVE_ENV=local only for single-machine tests).");
  }
  const client = new PGlite(process.env.PGLITE_DIR ?? "./.pglite");
  return drizzlePglite(client, { schema, casing: "snake_case" });
}

// One connection per process, also reused across hot reloads in development.
const globalForDb = globalThis as unknown as { db?: Db };
function getDb(): Db {
  return (globalForDb.db ??= createDb());
}

/**
 * Lazily connected: nothing opens until the first query. This matters during
 * `next build`, where many worker processes import this module but never query;
 * opening PGlite eagerly in all of them would fight over the same data directory.
 */
export const db: Db = new Proxy({} as Db, {
  get(_, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
