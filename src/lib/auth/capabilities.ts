/**
 * Course-level permissions: what each course-staff role may do.
 *
 * Authorization asks "may this user do X in this course?" (a capability), never "is
 * this user an instructor?". New roles are added here, in one place; every action names
 * the capability it needs (see courseForInstructor in src/lib/access.ts).
 *
 * Pure module (no database access): unit-tested in tests/unit/logic.test.ts.
 */
export type CourseStaffRole = "coordinator" | "instructor" | "teaching_assistant";

export type CourseCapability =
  | "course.view" // open the course as staff, see participants
  | "course.manage" // settings, sections, materials, activities, enrolment, live classes
  | "grade.view" // gradebook, analytics, exports
  | "grade.edit" // grade submissions
  | "discussion.moderate"; // pin, lock, delete posts; post announcements

const ALL: readonly CourseCapability[] = ["course.view", "course.manage", "grade.view", "grade.edit", "discussion.moderate"];

const CAPABILITIES: Record<CourseStaffRole, ReadonlySet<CourseCapability>> = {
  coordinator: new Set(ALL),
  instructor: new Set(ALL),
  // Teaching assistants help with marking and the forum, but can't change the course.
  teaching_assistant: new Set<CourseCapability>(["course.view", "grade.view", "grade.edit", "discussion.moderate"]),
};

export function staffCan(role: CourseStaffRole | null | undefined, capability: CourseCapability): boolean {
  return role != null && CAPABILITIES[role].has(capability);
}

export const STAFF_ROLE_LABEL: Record<CourseStaffRole, string> = {
  coordinator: "Course coordinator",
  instructor: "Instructor",
  teaching_assistant: "Teaching assistant",
};
