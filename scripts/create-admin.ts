/**
 * Creates the first administrator on a fresh installation (no sample data needed).
 *
 *   npm run create-admin -- it.office@university.edu "Office of Academic IT"
 *
 * Prints a one-time temporary password; the admin must change it at first sign-in.
 * Stop the dev server first when using the built-in PGlite database.
 */
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { db, schema } from "../src/db";

async function main() {
  const [email, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(" ").trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || name.length < 2) {
    console.error('Usage: npm run create-admin -- <email> "<Full name>"');
    process.exit(1);
  }
  const words = ["amber", "brook", "cedar", "delta", "ember", "frost", "grove", "haven", "iris", "jade", "kite", "lotus", "maple", "nova", "orbit", "pearl"];
  const pick = () => words[randomInt(words.length)];
  const password = `${pick()}-${pick()}-${pick()}-${randomInt(1000, 10000)}`;

  const inserted = await db
    .insert(schema.users)
    .values({ role: "admin", name, email: email.toLowerCase(), passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true })
    .onConflictDoNothing()
    .returning({ id: schema.users.id });
  if (!inserted.length) {
    console.error(`An account with ${email} already exists.`);
    process.exit(1);
  }
  console.log(`Administrator created: ${email}\nTemporary password (shown once): ${password}\nSign in and choose your own password.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
