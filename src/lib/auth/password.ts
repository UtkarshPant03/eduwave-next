import "server-only";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";

// Cost 12 is a reasonable 2020s default (~250 ms per hash on a typical server).
export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// A real hash for a throwaway password. Comparing against it when the user does
// not exist keeps response timing similar, so attackers can't probe valid accounts.
let dummyHash: Promise<string> | undefined;
export async function burnTime(plain: string) {
  dummyHash ??= bcrypt.hash("not-a-real-password", 12);
  await bcrypt.compare(plain, await dummyHash);
}

// Small deny-list of the most common passwords. (A full list such as the top 10k
// from SecLists can be dropped in here; length matters more than complexity rules.)
const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890", "qwertyuiop",
  "iloveyou", "11111111", "abc12345", "admin123", "welcome1", "letmein123", "student123",
  "teacher123", "qwerty123", "passw0rd", "india@123", "00000000",
]);

/** Shared password rule (NIST SP 800-63B style: length + deny-list, no forced symbols). */
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .max(200)
  .refine((p) => !COMMON.has(p.toLowerCase()), "That password is too common. Choose another.");

/** Readable temporary password, e.g. "kite-ruby-4821" (no ambiguous characters). */
export function generateTempPassword() {
  const words = ["amber", "brook", "cedar", "delta", "ember", "frost", "grove", "haven", "iris", "jade", "kite", "lotus", "maple", "nova", "orbit", "pearl", "quill", "ruby", "sage", "tide", "umber", "vivid", "willow", "zephyr"];
  const pick = () => words[randomInt(words.length)];
  return `${pick()}-${pick()}-${randomInt(1000, 10000)}`;
}
