import "server-only";
import { headers } from "next/headers";
import { db, schema } from "@/db";
import { serverEnv } from "@/lib/env";

/**
 * The client's IP address, or null when it can't be known reliably.
 *
 * X-Forwarded-For is a list that every proxy APPENDS to, and the client can pre-fill it
 * with anything. Only the entries added by proxies we run are trustworthy, so we count
 * TRUSTED_PROXY_HOPS entries from the right (e.g. 1 behind a single Nginx/Caddy).
 * With no trusted proxy configured we don't guess: taking the leftmost entry would let
 * anyone bypass per-IP rate limits or forge IPs in the audit log.
 */
export async function clientIp(): Promise<string | null> {
  const hops = serverEnv().TRUSTED_PROXY_HOPS;
  if (hops === 0) return null;
  const chain = (await headers())
    .get("x-forwarded-for")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!chain || chain.length < hops) return null;
  return chain[chain.length - hops] ?? null;
}

export type AuditAction =
  | "login"
  | "login_failed"
  | "login_locked"
  | "logout"
  | "password_changed"
  | "password_reset"
  | "sessions_revoked"
  | "user_created"
  | "user_deactivated"
  | "user_reactivated"
  | "course_created"
  | "course_published"
  | "course_hidden"
  | "enrolment_added"
  | "enrolment_removed"
  | "activity_deleted"
  | "grade_changed"
  | "structure_changed"
  | "course_staff_changed"
  | "role_changed"
  | "bank_questions_copied";

/**
 * Records a security or academic event. `userId` is the account the event is about;
 * `actorId` is who did it, when that's someone else (e.g. an admin).
 * Never record passwords, tokens or other secrets in `detail`.
 *
 * Never throws: auditing must not break the action being audited. Failures are logged.
 */
export async function audit(userId: string | null, action: AuditAction, detail?: string, actorId?: string) {
  try {
    await db.insert(schema.auditLog).values({ userId, actorId: actorId ?? null, action, detail, ip: await clientIp() });
  } catch (err) {
    console.error("audit log failed", action, err instanceof Error ? err.message : err);
  }
}
