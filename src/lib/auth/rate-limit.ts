/**
 * Minimal fixed-window rate limiter for login attempts.
 *
 * Limitation (deliberate, for teaching): state lives in this server process's memory.
 * With several server instances (e.g. serverless), each has its own counter. Production
 * deployments should use a shared store such as Redis/Upstash.
 */
import "server-only";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Returns true if this key may try again. */
export function allowAttempt(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= MAX_ATTEMPTS;
}

export function resetAttempts(key: string) {
  buckets.delete(key);
}
