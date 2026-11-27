/**
 * Institution module: read queries for the academic structure (departments,
 * programmes, sessions, terms, batches, class sections) and course offerings' links
 * into it. Callers must have authorised the user (admin console).
 */
import "server-only";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const { departments, programmes, academicSessions, terms, batches, classSections, studentSections, courseSections, courses } = schema;

/** Optional department filter: undefined = all departments. */
type Scope = string[] | undefined;

export function listDepartments(only?: Scope) {
  return db
    .select({
      id: departments.id,
      code: departments.code,
      name: departments.name,
      active: departments.active,
      programmes: sql<number>`(select count(*) from programmes p where p.department_id = ${departments.id})`.mapWith(Number),
      courses: sql<number>`(select count(*) from courses c where c.department_id = ${departments.id})`.mapWith(Number),
    })
    .from(departments)
    .where(only ? inArray(departments.id, only.length ? only : ["00000000-0000-0000-0000-000000000000"]) : undefined)
    .orderBy(asc(departments.name));
}

const inDepartments = (only: Scope) => (only ? inArray(programmes.departmentId, only.length ? only : ["00000000-0000-0000-0000-000000000000"]) : undefined);

export function listProgrammes(only?: Scope) {
  return db
    .select({ id: programmes.id, name: programmes.name, code: programmes.code, semesters: programmes.semesters, active: programmes.active, department: departments.name })
    .from(programmes)
    .innerJoin(departments, eq(departments.id, programmes.departmentId))
    .where(inDepartments(only))
    .orderBy(asc(departments.name), asc(programmes.name));
}

/** Terms with their session, newest first; `label` is how a term is shown everywhere. */
export function listTerms() {
  return db
    .select({
      id: terms.id,
      name: terms.name,
      startsOn: terms.startsOn,
      endsOn: terms.endsOn,
      session: academicSessions.name,
      label: sql<string>`${academicSessions.name} || ' · ' || ${terms.name}`,
    })
    .from(terms)
    .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId))
    .orderBy(desc(terms.startsOn));
}

export function listSessions() {
  return db.select().from(academicSessions).orderBy(desc(academicSessions.startsOn));
}

export function listBatches(only?: Scope) {
  return db
    .select({ id: batches.id, name: batches.name, intakeYear: batches.intakeYear, programme: programmes.name })
    .from(batches)
    .innerJoin(programmes, eq(programmes.id, batches.programmeId))
    .where(inDepartments(only))
    .orderBy(desc(batches.intakeYear), asc(batches.name));
}

/** Class sections with their batch, and how many students each has per term. */
export function listClassSections(only?: Scope) {
  return db
    .select({
      id: classSections.id,
      name: classSections.name,
      batch: batches.name,
      label: sql<string>`${batches.name} || ' – ' || ${classSections.name}`,
      members: sql<number>`(select count(*) from student_sections ss where ss.section_id = ${classSections.id})`.mapWith(Number),
    })
    .from(classSections)
    .innerJoin(batches, eq(batches.id, classSections.batchId))
    .innerJoin(programmes, eq(programmes.id, batches.programmeId))
    .where(inDepartments(only))
    .orderBy(desc(batches.intakeYear), asc(batches.name), asc(classSections.name));
}

/** Class sections linked to a course offering, with their member count for the course's term. */
export async function courseSectionLinks(courseId: string, termId: string | null) {
  return db
    .select({
      sectionId: classSections.id,
      label: sql<string>`${batches.name} || ' – ' || ${classSections.name}`,
      members: termId
        ? sql<number>`(select count(*) from student_sections ss where ss.section_id = ${classSections.id} and ss.term_id = ${termId})`.mapWith(Number)
        : sql<number>`0`.mapWith(Number),
    })
    .from(courseSections)
    .innerJoin(classSections, eq(classSections.id, courseSections.sectionId))
    .innerJoin(batches, eq(batches.id, classSections.batchId))
    .where(eq(courseSections.courseId, courseId))
    .orderBy(asc(batches.name), asc(classSections.name));
}

/** Course offering with its academic links, for the admin course page. */
export async function courseForAdmin(courseId: string) {
  const [row] = await db
    .select({ course: courses, department: departments.name, term: sql<string | null>`${academicSessions.name} || ' · ' || ${terms.name}` })
    .from(courses)
    .leftJoin(departments, eq(departments.id, courses.departmentId))
    .leftJoin(terms, eq(terms.id, courses.termId))
    .leftJoin(academicSessions, eq(academicSessions.id, terms.sessionId))
    .where(eq(courses.id, courseId));
  return row ?? null;
}

/** Students in a section for a term (the roster a section enrolment would add). */
export async function sectionRosterSize(sectionId: string, termId: string) {
  const [r] = await db
    .select({ n: count() })
    .from(studentSections)
    .where(and(eq(studentSections.sectionId, sectionId), eq(studentSections.termId, termId)));
  return r.n;
}

/** Department role holders (administrators' view). */
export function listDepartmentRoles() {
  const ra = schema.roleAssignments;
  return db
    .select({ id: ra.id, role: ra.role, department: departments.name, user: schema.users.name, email: schema.users.email })
    .from(ra)
    .innerJoin(departments, eq(departments.id, ra.departmentId))
    .innerJoin(schema.users, eq(schema.users.id, ra.userId))
    .orderBy(asc(departments.name), asc(ra.role), asc(schema.users.name));
}

/** A department's course offerings (for its managers). */
export function departmentCourses(departmentId: string) {
  return db
    .select({ id: courses.id, code: courses.code, title: courses.title, term: courses.term, published: courses.published })
    .from(courses)
    .where(eq(courses.departmentId, departmentId))
    .orderBy(desc(courses.term), asc(courses.code));
}

/** Departments a user manages, with names (for the instructor dashboard). */
export function managedDepartmentList(userId: string) {
  const ra = schema.roleAssignments;
  return db
    .selectDistinct({ id: departments.id, name: departments.name, role: ra.role })
    .from(ra)
    .innerJoin(departments, eq(departments.id, ra.departmentId))
    .where(eq(ra.userId, userId))
    .orderBy(asc(departments.name));
}
