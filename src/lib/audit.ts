import "server-only";
import { headers } from "next/headers";
import { db, schema } from "@/db";

/**
 * Client IP as reported by the hosting proxy. Only trust X-Forwarded-For when the
 * app runs behind a proxy you control (Vercel, Nginx); otherwise it can be spoofed.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

export type AuditAction =
  | "login"
  | "login_failed"
  | "login_locked"
  | "logout"
  | "password_changed"
  | "password_reset_by_teacher"
  | "sessions_revoked"
  | "teacher_registered";

/** Never throws: auditing must not break the action being audited. */
export async function audit(userId: string | null, action: AuditAction, detail?: string) {
  try {
    await db.insert(schema.auditLog).values({ userId, action, detail, ip: await clientIp() });
  } catch (err) {
    console.error("audit log failed", err);
  }
}
