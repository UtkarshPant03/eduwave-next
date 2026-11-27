/**
 * Department-scoped authorization.
 *
 * University administrators manage everything. Staff holding a department role
 * (department admin, HOD or dean, in role_assignments) manage only their own
 * department(s): its programmes, batches, class sections and course offerings.
 * Everyone else is refused with a 404, so department ids can't be probed.
 */
import "server-only";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { type CurrentUser, requireUser } from "./dal";

/** Departments the user manages: "all" for admins, else the ids from role_assignments. */
export async function managedDepartments(user: CurrentUser): Promise<"all" | string[]> {
  if (user.role === "admin") return "all";
  if (user.role !== "instructor") return [];
  const rows = await db
    .select({ id: schema.roleAssignments.departmentId })
    .from(schema.roleAssignments)
    .where(eq(schema.roleAssignments.userId, user.id));
  return [...new Set(rows.map((r) => r.id))];
}

export async function managesDepartment(user: CurrentUser, departmentId: string | null | undefined): Promise<boolean> {
  if (user.role === "admin") return true;
  if (!departmentId) return false; // unlinked items are administrator territory
  const scope = await managedDepartments(user);
  return scope === "all" || scope.includes(departmentId);
}

/** The signed-in user, if they may manage this department; otherwise a 404. */
export async function requireDepartmentManager(departmentId: string | null | undefined): Promise<CurrentUser> {
  const user = await requireUser();
  if (!(await managesDepartment(user, departmentId))) notFound();
  return user;
}

/** Which department a structure item or course offering belongs to (null if none/unknown). */
export async function departmentOf(kind: "programme" | "batch" | "section" | "course", id: string): Promise<string | null> {
  const { programmes, batches, classSections } = schema;
  if (kind === "programme") return (await db.query.programmes.findFirst({ where: (p, { eq }) => eq(p.id, id), columns: { departmentId: true } }))?.departmentId ?? null;
  if (kind === "course") return (await db.query.courses.findFirst({ where: (c, { eq }) => eq(c.id, id), columns: { departmentId: true } }))?.departmentId ?? null;
  if (kind === "batch") {
    const [r] = await db.select({ d: programmes.departmentId }).from(batches).innerJoin(programmes, eq(programmes.id, batches.programmeId)).where(eq(batches.id, id));
    return r?.d ?? null;
  }
  const [r] = await db
    .select({ d: programmes.departmentId })
    .from(classSections)
    .innerJoin(batches, eq(batches.id, classSections.batchId))
    .innerJoin(programmes, eq(programmes.id, batches.programmeId))
    .where(eq(classSections.id, id));
  return r?.d ?? null;
}

export const DEPARTMENT_ROLE_LABEL = { department_admin: "Department administrator", hod: "Head of department", dean: "Dean" } as const;
