import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` only diffs the schema file against previous migrations,
// so it needs no database connection. Migrations are applied by scripts/migrate.ts.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
});
