import "server-only";
import { sql } from "drizzle-orm";

/**
 * Outer-row reference for correlated subqueries. ALWAYS use this (with an aliased
 * inner table) instead of interpolating a column like ${courses.id}: in single-table
 * selects Drizzle renders columns unqualified, so "id" would silently bind to the
 * INNER table's id and return wrong counts. (This exact bug was found by the E2E tests.)
 */
export const outer = (table: string, column: string) => sql.raw(`"${table}"."${column}"`);

/** Count of rows from a raw subquery, as a number. */
export const countOf = (query: ReturnType<typeof sql>) => sql<number>`(${query})`.mapWith(Number);

export const nullableNumber = (v: unknown) => (v == null ? null : Number(v));

/** WHERE condition: the outer `courses` row has this user on its course staff. */
export const staffOf = (userId: string) =>
  sql`exists (select 1 from course_staff cs where cs.course_id = ${outer("courses", "id")} and cs.user_id = ${userId})`;
