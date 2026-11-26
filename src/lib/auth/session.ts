/**
 * Database-backed sessions.
 *
 * Why not a JWT in localStorage like the original app?
 * - localStorage is readable by any script on the page (XSS => stolen login).
 * - A JWT cannot be revoked before it expires; a session row can be deleted.
 *
 * The browser holds a random token in an httpOnly cookie (invisible to JS).
 * The database stores only its SHA-256 hash.
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import { db, schema } from "@/db";

export const SESSION_COOKIE = "eduwave_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function currentSessionId() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await db.insert(schema.sessions).values({ id: hashToken(token), userId, expiresAt, userAgent });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Returns the signed-in user's id, or null if the cookie is missing, unknown or expired. */
export async function readSessionUserId(): Promise<string | null> {
  const id = await currentSessionId();
  if (!id) return null;
  const session = await db.query.sessions.findFirst({ where: (s, { eq }) => eq(s.id, id) });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  return session.userId;
}

export async function deleteSession() {
  const id = await currentSessionId();
  if (id) await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
  (await cookies()).delete(SESSION_COOKIE);
}

/** Active sessions for the Security page; `current` marks this browser. */
export async function listSessions(userId: string) {
  const current = await currentSessionId();
  const rows = await db
    .select({ id: schema.sessions.id, createdAt: schema.sessions.createdAt, userAgent: schema.sessions.userAgent })
    .from(schema.sessions)
    .where(and(eq(schema.sessions.userId, userId), gt(schema.sessions.expiresAt, new Date())))
    .orderBy(desc(schema.sessions.createdAt));
  // Never send session ids (token hashes) to the browser.
  return rows.map(({ id, ...r }) => ({ ...r, current: id === current }));
}

/** Logs out every other device, e.g. after a password change. */
export async function revokeOtherSessions(userId: string) {
  const current = await currentSessionId();
  const where = current
    ? and(eq(schema.sessions.userId, userId), ne(schema.sessions.id, current))
    : eq(schema.sessions.userId, userId);
  await db.delete(schema.sessions).where(where);
}

/** Logs out all devices of a user (used when a teacher resets a student's password). */
export async function revokeAllSessions(userId: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}
