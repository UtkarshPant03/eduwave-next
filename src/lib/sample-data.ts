/**
 * The published sample accounts created by `npm run db:seed`. Their shared password is
 * printed in the README, so they must never exist in a production database.
 * Shared by the seed script (which creates them) and the startup check (which refuses them).
 */
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";

export const SAMPLE_PASSWORD = "eduwave2026";

export const SAMPLE_EMAILS = [
  "admin@eduwave.edu",
  "meera.iyer@eduwave.edu",
  "rahul.verma@eduwave.edu",
  "sara.thomas@eduwave.edu",
] as const;

export async function sampleAccountsPresent(): Promise<boolean> {
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(inArray(schema.users.email, [...SAMPLE_EMAILS]))
    .limit(1);
  return rows.length > 0;
}
