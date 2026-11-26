import "server-only";
import bcrypt from "bcryptjs";

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
