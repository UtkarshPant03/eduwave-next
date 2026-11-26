/**
 * Login throttling, stored in Postgres so it survives restarts and works when the
 * app runs on several instances (the old in-memory limiter did neither).
 *
 * Two keys are checked on every login:
 *   - the account (stops guessing one person's password)
 *   - the client IP (stops trying one common password across many accounts)
 */
import "server-only";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";

const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;
const LIMITS = { account: 5, ip: 30 };

type Kind = keyof typeof LIMITS;

/** Returns the lock expiry if this key is currently locked out, else null. */
export async function lockedUntil(kind: Kind, id: string): Promise<Date | null> {
  const row = await db.query.loginThrottle.findFirst({ where: (t, { eq }) => eq(t.key, `${kind}:${id}`) });
  return row?.lockedUntil && row.lockedUntil.getTime() > Date.now() ? row.lockedUntil : null;
}

/** Records a failed login; locks the key once it reaches its limit within the window. */
export async function recordFailure(kind: Kind, id: string) {
  const key = `${kind}:${id}`;
  const limit = LIMITS[kind];
  const t = schema.loginThrottle;
  // One atomic upsert: reset the counter if the window expired, otherwise increment.
  await db
    .insert(t)
    .values({ key, failures: 1 })
    .onConflictDoUpdate({
      target: t.key,
      set: {
        failures: sql`case when ${t.windowStart} < now() - ${`${WINDOW_MS} milliseconds`}::interval then 1 else ${t.failures} + 1 end`,
        windowStart: sql`case when ${t.windowStart} < now() - ${`${WINDOW_MS} milliseconds`}::interval then now() else ${t.windowStart} end`,
        lockedUntil: sql`case when ${t.windowStart} >= now() - ${`${WINDOW_MS} milliseconds`}::interval and ${t.failures} + 1 >= ${limit} then now() + ${`${LOCK_MS} milliseconds`}::interval else ${t.lockedUntil} end`,
      },
    });
}

export async function clearFailures(kind: Kind, id: string) {
  await db.delete(schema.loginThrottle).where(sql`${schema.loginThrottle.key} = ${`${kind}:${id}`}`);
}

/**
 * General-purpose fixed-window rate limit (same table, "rl:" keys).
 * Returns true if the call is allowed. Used for the AI endpoints.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const t = schema.loginThrottle;
  const window = `${windowMs} milliseconds`;
  const [row] = await db
    .insert(t)
    .values({ key: `rl:${key}`, failures: 1 })
    .onConflictDoUpdate({
      target: t.key,
      set: {
        failures: sql`case when ${t.windowStart} < now() - ${window}::interval then 1 else ${t.failures} + 1 end`,
        windowStart: sql`case when ${t.windowStart} < now() - ${window}::interval then now() else ${t.windowStart} end`,
      },
    })
    .returning({ count: t.failures });
  return row.count <= limit;
}
