/**
 * Environment configuration: one validated source of truth for every setting.
 *
 * Deployment modes (EDUWAVE_ENV):
 * - development  default for `npm run dev`. PGlite, sample data, HTTP all allowed.
 * - local        a production BUILD on one machine (tests, teaching labs, demos):
 *                PGlite and sample data allowed. Must be chosen explicitly.
 * - production   default whenever NODE_ENV=production. Requires PostgreSQL
 *                (DATABASE_URL), an https APP_URL and a complete SMTP config if any
 *                SMTP setting is given; refuses sample accounts (see instrumentation.ts).
 *
 * Secure by default: a production build never silently falls back to the local
 * database or to development settings. Choosing `local` is a deliberate act.
 *
 * Not marked "server-only" because the CLI scripts (migrate, seed, backup) use it too;
 * it is never imported by client components.
 */
import { z } from "zod";

export type DeploymentMode = "development" | "local" | "production";

// Treat empty strings ("DATABASE_URL=" in .env files) as "not set".
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

const envSchema = z.object({
  EDUWAVE_ENV: optional(z.enum(["development", "local", "production"])),
  DATABASE_URL: optional(z.string().regex(/^postgres(ql)?:\/\//, "must start with postgres:// or postgresql://")),
  PGLITE_DIR: optional(z.string()),
  APP_URL: optional(z.url({ protocol: /^https?$/ })),
  APP_TIME_ZONE: optional(z.string()),
  TRUSTED_PROXY_HOPS: z.preprocess((v) => (v === "" || v == null ? 0 : v), z.coerce.number().int().min(0).max(5)),
  SMTP_HOST: optional(z.string()),
  SMTP_PORT: optional(z.coerce.number().int().min(1).max(65535)),
  SMTP_USER: optional(z.string()),
  SMTP_PASS: optional(z.string()),
  SMTP_FROM: optional(z.string()),
  OLLAMA_URL: optional(z.url({ protocol: /^https?$/ })),
  OLLAMA_MODEL: optional(z.string()),
  JITSI_DOMAIN: optional(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "must be a host name like meet.example.edu")),
});

export type ServerEnv = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(public problems: string[]) {
    super(`Invalid configuration:\n  - ${problems.join("\n  - ")}`);
    this.name = "EnvError";
  }
}

let cached: ServerEnv | undefined;

/** Parsed and type-checked settings. Throws EnvError listing every malformed value. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) throw new EnvError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  return (cached = parsed.data);
}

export function deploymentMode(): DeploymentMode {
  return serverEnv().EDUWAVE_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "development");
}

/** Problems that make the current settings unsafe for the current mode (empty = OK). */
export function configurationProblems(): string[] {
  let env: ServerEnv;
  try {
    env = serverEnv();
  } catch (err) {
    return err instanceof EnvError ? err.problems : [String(err)];
  }
  if (deploymentMode() !== "production") return [];

  const problems: string[] = [];
  if (!env.DATABASE_URL)
    problems.push("DATABASE_URL is required in production (PostgreSQL). For a single-machine test or lab, set EDUWAVE_ENV=local instead.");
  if (!env.APP_URL) problems.push("APP_URL is required in production (the public https address, used in email links).");
  else if (!env.APP_URL.startsWith("https://")) problems.push("APP_URL must use https:// in production (cookies are Secure-only).");
  const smtp = [env.SMTP_HOST, env.SMTP_USER, env.SMTP_PASS];
  if (smtp.some(Boolean) && !smtp.every(Boolean))
    problems.push("SMTP is partly configured: set SMTP_HOST, SMTP_USER and SMTP_PASS together (or none of them).");
  return problems;
}
