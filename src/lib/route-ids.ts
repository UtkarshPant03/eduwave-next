import "server-only";
import { notFound } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates every dynamic segment of a route (all our ids are UUIDs) before it reaches
 * a query. Without this, /student/courses/abc makes Postgres throw "invalid input syntax
 * for type uuid", which surfaces as a 500 error page instead of a clean 404.
 */
export function routeIds<T extends Record<string, string>>(params: T): T {
  for (const value of Object.values(params)) if (!UUID.test(value)) notFound();
  return params;
}
