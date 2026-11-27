/**
 * Recognising database constraint errors, so actions can turn them into clear messages.
 *
 * Postgres reports a SQLSTATE code. Drizzle wraps driver errors (node-postgres and PGlite
 * both expose `.code`), so we look at the error and at its `cause` chain.
 */
function sqlState(err: unknown): string | undefined {
  for (let e: unknown = err, depth = 0; e && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return undefined;
}

/** 23503: a row is still referenced (ON DELETE RESTRICT) or the parent is missing. */
export const isForeignKeyViolation = (err: unknown) => sqlState(err) === "23503";
/** 23514: a CHECK constraint failed (e.g. a grade below 0). */
export const isCheckViolation = (err: unknown) => sqlState(err) === "23514";
/** 23505: a UNIQUE constraint failed. */
export const isUniqueViolation = (err: unknown) => sqlState(err) === "23505";
/** P0001: raised by one of our integrity triggers (RAISE EXCEPTION). */
export const isIntegrityTrigger = (err: unknown) => sqlState(err) === "P0001";
