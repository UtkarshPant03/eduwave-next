/**
 * Database schema (LMS).
 *
 * Core idea, as in Moodle: users ENROL in many COURSES; a course is organised into
 * SECTIONS (weeks/topics) that contain ACTIVITIES (resources, assignments, quizzes,
 * live sessions). Every relationship is a foreign key; integrity rules (one attempt
 * per quiz, one submission per assignment) are database constraints, not app code.
 *
 * Integrity layers (see docs/DATABASE.md):
 * - Composite foreign keys keep related rows in the SAME course/quiz (a section of
 *   course A can't hold an assignment of course B; an answer can't point at another
 *   quiz's question).
 * - CHECK constraints keep values in range (grades >= 0, valid option indexes, ...).
 * - ON DELETE RESTRICT protects academic records (submissions, attempts, answers).
 * - Triggers in drizzle/0001_integrity.sql cover rules that span tables: answers are
 *   frozen once an attempt is graded, questions are frozen once anyone has started, a
 *   grade can't exceed the assignment's maximum, and the audit log is append-only.
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Binary column for uploaded files (Postgres `bytea` <-> Node Buffer).
const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (v) => Buffer.from(v),
});

const ts = () => timestamp({ withTimezone: true });
const createdAt = () => ts().notNull().defaultNow();

/* ============================== people ============================== */

export const roleEnum = pgEnum("role", ["admin", "instructor", "student"]);

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  role: roleEnum().notNull(),
  name: text().notNull(),
  email: text().notNull().unique(),
  // University ID for students (e.g. 22CS1043); students may sign in with it.
  studentId: text().unique(),
  passwordHash: text().notNull(),
  // Set when an admin/instructor issues a password: the user must choose their own.
  mustChangePassword: boolean().notNull().default(false),
  // Deactivated accounts can't sign in, but their records (grades, posts) are kept.
  active: boolean().notNull().default(true),
  department: text(),
  program: text(), // e.g. "B.Tech CSE, Year 2"
  bio: text(),
  lastLoginAt: ts(),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 of the cookie token. A leaked database row cannot be replayed as a cookie.
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts().notNull(),
    createdAt: createdAt(),
    userAgent: text(),
  },
  (t) => [index().on(t.userId)],
);

/** Login throttling stored in the DB, so it works across server instances/restarts. */
export const loginThrottle = pgTable("login_throttle", {
  key: text().primaryKey(),
  failures: integer().notNull().default(0),
  windowStart: ts().notNull().defaultNow(),
  lockedUntil: ts(),
});

/** Security-relevant events. Users see their own; admins see everything. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    // The account the event is about. RESTRICT: audit history outlives nothing silently
    // (accounts are deactivated, never deleted).
    userId: uuid().references(() => users.id, { onDelete: "restrict" }),
    // Who performed the action, when it differs from userId (e.g. an admin resetting a password).
    actorId: uuid().references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    action: text().notNull(),
    detail: text(),
    ip: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.createdAt), index().on(t.action, t.createdAt)],
);

/* ============================ institution ============================ */
/*
 * The university's academic structure (Phase 2). Routine changes (a new programme,
 * batch or section) are DATA, not code. Two independent axes:
 *   departments → programmes → batches (intake year) → class sections ("A", "B")
 *   academic sessions ("2026–27") → terms ("Odd semester")
 * A student belongs to one class section per term (student_sections), so section
 * changes between semesters keep their history.
 */

export const departments = pgTable("departments", {
  id: uuid().primaryKey().defaultRandom(),
  // Optional short code (e.g. "CSE"). Not invented: left empty until an admin sets it.
  code: text().unique(),
  name: text().notNull().unique(),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
});

export const programmes = pgTable(
  "programmes",
  {
    id: uuid().primaryKey().defaultRandom(),
    departmentId: uuid()
      .notNull()
      .references(() => departments.id, { onDelete: "restrict" }),
    code: text(),
    name: text().notNull(), // e.g. "B.Tech Computer Science and Engineering"
    semesters: integer().notNull(),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.departmentId, t.name), check("programmes_semesters_check", sql`${t.semesters} between 1 and 16`)],
);

export const academicSessions = pgTable(
  "academic_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull().unique(), // e.g. "2026–27"
    startsOn: date().notNull(),
    endsOn: date().notNull(),
  },
  (t) => [check("academic_sessions_dates_check", sql`${t.endsOn} > ${t.startsOn}`)],
);

export const terms = pgTable(
  "terms",
  {
    id: uuid().primaryKey().defaultRandom(),
    sessionId: uuid()
      .notNull()
      .references(() => academicSessions.id, { onDelete: "restrict" }),
    name: text().notNull(), // e.g. "Odd semester"
    startsOn: date().notNull(),
    endsOn: date().notNull(),
  },
  (t) => [unique().on(t.sessionId, t.name), check("terms_dates_check", sql`${t.endsOn} > ${t.startsOn}`)],
);

export const batches = pgTable(
  "batches",
  {
    id: uuid().primaryKey().defaultRandom(),
    programmeId: uuid()
      .notNull()
      .references(() => programmes.id, { onDelete: "restrict" }),
    intakeYear: integer().notNull(),
    name: text().notNull(), // e.g. "B.Tech CSE 2024"
  },
  (t) => [unique().on(t.programmeId, t.intakeYear), check("batches_year_check", sql`${t.intakeYear} between 1990 and 2200`)],
);

export const classSections = pgTable(
  "class_sections",
  {
    id: uuid().primaryKey().defaultRandom(),
    batchId: uuid()
      .notNull()
      .references(() => batches.id, { onDelete: "restrict" }),
    name: text().notNull(), // e.g. "A"
  },
  (t) => [unique().on(t.batchId, t.name)],
);

/** A student's class section for a term (one per term; history kept across terms). */
export const studentSections = pgTable(
  "student_sections",
  {
    studentId: uuid()
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    termId: uuid()
      .notNull()
      .references(() => terms.id, { onDelete: "restrict" }),
    sectionId: uuid()
      .notNull()
      .references(() => classSections.id, { onDelete: "restrict" }),
    assignedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.termId] }), index().on(t.sectionId, t.termId)],
);

/** Scoped institutional roles (beyond a user's persona): e.g. department administrator. */
export const scopedRoleEnum = pgEnum("scoped_role", ["department_admin", "hod", "dean"]);

export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    role: scopedRoleEnum().notNull(),
    departmentId: uuid()
      .notNull()
      .references(() => departments.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.userId, t.role, t.departmentId), index().on(t.departmentId)],
);

/* ============================== courses ============================== */

/** How a course total is calculated (4.6). `points` = the pre-4.6 calculation. */
export const gradeTotalMethodEnum = pgEnum("grade_total_method", ["points", "weighted"]);

export const courses = pgTable(
  "courses",
  {
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull(), // e.g. CS201
    title: text().notNull(),
    description: text(),
    department: text().notNull(),
    term: text().notNull(), // e.g. "Spring 2027"
    credits: integer().notNull().default(3),
    // Cover art key (see components/course-cover.tsx).
    color: text().notNull().default("indigo"),
    instructorId: uuid()
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    // Students can self-enrol with this key. null = enrolment closed (instructor adds students).
    enrollmentKey: text(),
    published: boolean().notNull().default(true),
    // Links into the academic structure (nullable: older courses keep their text
    // department/term until an admin links them; migration 0003 links departments).
    departmentId: uuid().references(() => departments.id, { onDelete: "restrict" }),
    termId: uuid().references(() => terms.id, { onDelete: "restrict" }),
    // Course total: sum of points (default) or weighted categories (see src/lib/grading.ts).
    gradeTotalMethod: gradeTotalMethodEnum().notNull().default("points"),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.code, t.term),
    index().on(t.instructorId),
    index().on(t.departmentId),
    index().on(t.termId),
    check("courses_credits_check", sql`${t.credits} >= 0`),
  ],
);

/**
 * Who teaches a course. Several faculty can share an offering; teaching assistants
 * get a narrower set of capabilities (see src/lib/auth/capabilities.ts).
 * `courses.instructor_id` remains the primary instructor and is always also listed here.
 */
export const courseStaffRoleEnum = pgEnum("course_staff_role", ["coordinator", "instructor", "teaching_assistant"]);

export const courseStaff = pgTable(
  "course_staff",
  {
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    role: courseStaffRoleEnum().notNull(),
    addedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.courseId, t.userId] }), index().on(t.userId)],
);

/** Which class sections take a course offering (used to enrol whole sections). */
export const courseSections = pgTable(
  "course_sections",
  {
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    sectionId: uuid()
      .notNull()
      .references(() => classSections.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.courseId, t.sectionId] }), index().on(t.sectionId)],
);

export const enrollments = pgTable(
  "enrollments",
  {
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    enrolledAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.courseId, t.userId] }), index().on(t.userId)],
);

/** Weekly/topic sections of a course page. */
export const sections = pgTable(
  "sections",
  {
    id: uuid().primaryKey().defaultRandom(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    title: text().notNull(),
    summary: text(),
  },
  // (id, course_id) is unique so activities can reference "a section OF THIS COURSE".
  (t) => [index().on(t.courseId, t.position), unique("sections_id_course_unique").on(t.id, t.courseId)],
);

const sectionRef = () => uuid().references(() => sections.id, { onDelete: "set null" });

/**
 * Keeps an activity's section inside the activity's own course. The single-column FK
 * above still handles ON DELETE SET NULL; this composite FK (MATCH SIMPLE: skipped when
 * section_id is null) only rejects a section that belongs to a different course.
 */
const sameCourseSection = (name: string, t: { sectionId: AnyPgColumn; courseId: AnyPgColumn }) =>
  foreignKey({ name, columns: [t.sectionId, t.courseId], foreignColumns: [sections.id, sections.courseId] });
const courseRef = () =>
  uuid()
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" });

/* ============================== content ============================== */

/** Uploaded files live in Postgres: no paid object storage needed for course-sized use. */
export const files = pgTable("files", {
  id: uuid().primaryKey().defaultRandom(),
  courseId: courseRef(),
  uploaderId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text().notNull(),
  mimeType: text().notNull(),
  size: integer().notNull(),
  data: bytea().notNull(),
  createdAt: createdAt(),
}, (t) => [
  index().on(t.courseId),
  index().on(t.uploaderId),
  unique("files_id_course_unique").on(t.id, t.courseId),
  check("files_size_check", sql`${t.size} >= 0`),
]);

export const resources = pgTable(
  "resources",
  {
    id: uuid().primaryKey().defaultRandom(),
    courseId: courseRef(),
    sectionId: sectionRef(),
    title: text().notNull(),
    description: text(),
    // Exactly one of url / fileId is set.
    url: text(),
    fileId: uuid().references(() => files.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.courseId),
    index().on(t.sectionId),
    index().on(t.fileId),
    sameCourseSection("resources_section_same_course_fk", t),
    // An attached file must belong to the same course.
    foreignKey({ name: "resources_file_same_course_fk", columns: [t.fileId, t.courseId], foreignColumns: [files.id, files.courseId] }),
    check("resources_url_xor_file_check", sql`num_nonnulls(${t.url}, ${t.fileId}) = 1`),
  ],
);

/* ============================== gradebook ============================== */
/*
 * Phase 3 (4.6). Grading policy is data, never code (decision D4 is open): each course
 * chooses its total method, its categories and weights, and its grade scale. The defaults
 * reproduce the pre-4.6 behaviour exactly. See docs/DATABASE.md ("Plan for 0007").
 */

/** Weighted-total categories of a course (names and weights are the course's own choice). */
export const gradeCategories = pgTable(
  "grade_categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    courseId: courseRef(),
    name: text().notNull(),
    // Percent of the course total (0–100). In weighted mode the course's weights total 100.
    weight: doublePrecision().notNull().default(0),
    position: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.courseId, t.name),
    unique("grade_categories_id_course_unique").on(t.id, t.courseId),
    check("grade_categories_weight_check", sql`${t.weight} >= 0 and ${t.weight} <= 100`),
    check("grade_categories_name_check", sql`length(btrim(${t.name})) between 1 and 60`),
  ],
);

const gradeCategoryRef = () => uuid().references(() => gradeCategories.id, { onDelete: "set null" });
/** Keeps an item's grade category inside the item's own course (same pattern as sections). */
const sameCourseCategory = (name: string, t: { gradeCategoryId: AnyPgColumn; courseId: AnyPgColumn }) =>
  foreignKey({ name, columns: [t.gradeCategoryId, t.courseId], foreignColumns: [gradeCategories.id, gradeCategories.courseId] });

/** A course's grade scale as data (each course gets the default 10-point scale on creation). */
export const gradeBands = pgTable(
  "grade_bands",
  {
    courseId: courseRef(),
    letter: text().notNull(),
    label: text().notNull(),
    // The band applies from this whole-number percentage up (the displayed percentage).
    minPercent: integer().notNull(),
    // Grade points for this band (used for the provisional GPA).
    points: doublePrecision().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.courseId, t.letter] }),
    check("grade_bands_min_check", sql`${t.minPercent} between 0 and 100`),
    check("grade_bands_points_check", sql`${t.points} >= 0 and ${t.points} <= 100`),
    check("grade_bands_letter_check", sql`length(btrim(${t.letter})) between 1 and 8`),
    check("grade_bands_label_check", sql`length(${t.label}) <= 40`),
  ],
);

export const assignments = pgTable(
  "assignments",
  {
    id: uuid().primaryKey().defaultRandom(),
    courseId: courseRef(),
    sectionId: sectionRef(),
    title: text().notNull(),
    instructions: text().notNull(),
    dueAt: ts().notNull(),
    maxPoints: integer().notNull().default(100),
    // Submissions are accepted this many days after dueAt, marked late.
    lateDays: integer().notNull().default(0),
    // Files a student may attach to one submission (1 = the pre-4.5 behaviour).
    maxFiles: integer().notNull().default(1),
    // Gradebook category (4.6); required while the course uses weighted categories.
    gradeCategoryId: gradeCategoryRef(),
    // false = grades and feedback are hidden from students (true = the pre-4.6 behaviour).
    gradesReleased: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.courseId, t.dueAt),
    index().on(t.sectionId),
    sameCourseSection("assignments_section_same_course_fk", t),
    sameCourseCategory("assignments_grade_category_same_course_fk", t),
    unique("assignments_id_course_unique").on(t.id, t.courseId),
    check("assignments_points_check", sql`${t.maxPoints} > 0 and ${t.lateDays} >= 0`),
    check("assignments_max_files_check", sql`${t.maxFiles} between 1 and 20`),
  ],
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid().primaryKey().defaultRandom(),
    // RESTRICT: student work is never deleted as a side effect of deleting something else.
    assignmentId: uuid()
      .notNull()
      .references(() => assignments.id, { onDelete: "restrict" }),
    studentId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // text, file_id and submitted_at mirror the LATEST version (4.5+: see submission_versions);
    // file_id is that version's first file. Kept so existing queries work unchanged.
    text: text(),
    fileId: uuid().references(() => files.id, { onDelete: "set null" }),
    submittedAt: ts().notNull().defaultNow(),
    grade: integer(),
    feedback: text(),
    gradedAt: ts(),
    gradedBy: uuid().references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
  },
  (t) => [
    // One submission per student per assignment (resubmitting updates it).
    unique().on(t.assignmentId, t.studentId),
    index().on(t.studentId),
    index().on(t.fileId),
    // Grading queue: ungraded submissions only.
    index("submissions_ungraded_idx").on(t.assignmentId, t.submittedAt).where(sql`${t.grade} is null`),
    // grade <= max_points is a cross-table rule: enforced by a trigger (0001_integrity.sql).
    check("submissions_grade_check", sql`${t.grade} is null or ${t.grade} >= 0`),
  ],
);

/**
 * Every (re)submission is a read-only version (append-only, trigger in 0006). The latest
 * one is the version that gets graded; a graded submission accepts no new versions.
 */
export const submissionVersions = pgTable(
  "submission_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    submissionId: uuid()
      .notNull()
      .references(() => submissions.id, { onDelete: "restrict" }),
    versionNumber: integer().notNull(),
    text: text(),
    submittedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    unique("submission_versions_number_unique").on(t.submissionId, t.versionNumber),
    check("submission_versions_number_check", sql`${t.versionNumber} >= 1`),
  ],
);

/** The files of one version. A file kept from the previous version is linked again, not copied. */
export const submissionFiles = pgTable(
  "submission_files",
  {
    versionId: uuid()
      .notNull()
      .references(() => submissionVersions.id, { onDelete: "restrict" }),
    fileId: uuid()
      .notNull()
      .references(() => files.id, { onDelete: "restrict" }),
    position: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.versionId, t.fileId] }), index().on(t.fileId), check("submission_files_position_check", sql`${t.position} >= 0`)],
);

/** Files a grader attaches to their feedback (shown to the student once graded). */
export const feedbackFiles = pgTable(
  "feedback_files",
  {
    id: uuid().primaryKey().defaultRandom(),
    submissionId: uuid()
      .notNull()
      .references(() => submissions.id, { onDelete: "restrict" }),
    fileId: uuid()
      .notNull()
      .unique()
      .references(() => files.id, { onDelete: "restrict" }),
    uploadedBy: uuid()
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.submissionId)],
);

/**
 * Every grade change, kept forever: who changed which grade, from what, to what, when.
 * Written in the same transaction as the grade itself.
 */
export const gradeEvents = pgTable(
  "grade_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    submissionId: uuid()
      .notNull()
      .references(() => submissions.id, { onDelete: "restrict" }),
    graderId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    oldGrade: integer(),
    newGrade: integer().notNull(),
    feedbackChanged: boolean().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.submissionId, t.createdAt), index().on(t.graderId)],
);

/* ============================ question bank ============================ */
/*
 * Phase 3 (4.4). Each course has a bank of questions in staff-created categories. Quizzes
 * never link to the bank: adding a bank question copies it into `questions`, and a random
 * slot copies its category's questions into the quiz as a pool when the quiz is saved.
 * So bank edits can never change a started attempt or a score. See docs/DATABASE.md.
 */

export const questionTypeEnum = pgEnum("question_type", ["single", "multiple", "true_false", "short_answer", "numerical"]);
export const gradingMethodEnum = pgEnum("grading_method", ["highest", "average", "first", "last"]);

/** Answer-key columns shared by bank questions and quiz questions. */
const questionBody = () => ({
  type: questionTypeEnum().notNull().default("single"),
  prompt: text().notNull(),
  // Choice types only (empty for short answer and numerical).
  options: text().array().notNull(),
  // Never sent to students before the deadline. Grading happens on the server.
  correctIndex: integer(), // single choice, true/false
  correctIndexes: integer().array(), // multiple answer (all-or-nothing)
  acceptedAnswers: text().array(), // short answer (trimmed, case-insensitive, whitespace collapsed)
  numericAnswer: doublePrecision(), // numerical: accepted value ...
  tolerance: doublePrecision(), // ... plus or minus this (>= 0)
  points: integer().notNull().default(1),
  explanation: text(),
});

/** Each type's answer key must be complete and in range (coalesce: a NULL result must fail). */
const questionShapeCheck = (name: string, t: {
  type: AnyPgColumn; options: AnyPgColumn; correctIndex: AnyPgColumn; correctIndexes: AnyPgColumn;
  acceptedAnswers: AnyPgColumn; numericAnswer: AnyPgColumn; tolerance: AnyPgColumn;
}) =>
  check(
    name,
    sql`coalesce(case ${t.type}
      when 'single' then cardinality(${t.options}) between 2 and 6 and ${t.correctIndex} >= 0 and ${t.correctIndex} < cardinality(${t.options})
      when 'true_false' then cardinality(${t.options}) = 2 and ${t.correctIndex} between 0 and 1
      when 'multiple' then cardinality(${t.options}) between 2 and 6 and cardinality(${t.correctIndexes}) between 1 and cardinality(${t.options})
        and 0 <= all(${t.correctIndexes}) and cardinality(${t.options}) > all(${t.correctIndexes})
      when 'short_answer' then cardinality(${t.options}) = 0 and cardinality(${t.acceptedAnswers}) between 1 and 20
      when 'numerical' then cardinality(${t.options}) = 0 and ${t.numericAnswer} is not null and ${t.tolerance} >= 0
    end, false)`,
  );

export const questionCategories = pgTable(
  "question_categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    courseId: courseRef(),
    name: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.courseId, t.name), unique("question_categories_id_course_unique").on(t.id, t.courseId)],
);

export const bankQuestions = pgTable(
  "bank_questions",
  {
    id: uuid().primaryKey().defaultRandom(),
    courseId: courseRef(),
    categoryId: uuid().notNull(),
    ...questionBody(),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    createdBy: uuid()
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index().on(t.courseId, t.categoryId),
    // The category belongs to the same course; a category with questions can't be deleted.
    foreignKey({ name: "bank_questions_category_same_course_fk", columns: [t.categoryId, t.courseId], foreignColumns: [questionCategories.id, questionCategories.courseId] }).onDelete("restrict"),
    questionShapeCheck("bank_questions_shape_check", t),
    check("bank_questions_points_check", sql`${t.points} > 0`),
  ],
);

/* ============================== quizzes ============================== */

export const quizzes = pgTable(
  "quizzes",
  {
    id: uuid().primaryKey().defaultRandom(),
    courseId: courseRef(),
    sectionId: sectionRef(),
    title: text().notNull(),
    description: text(),
    timeLimitMinutes: integer().notNull(),
    deadline: ts().notNull(),
    shuffle: boolean().notNull().default(true),
    // Students can't start before this (null = open as soon as it's published).
    opensAt: ts(),
    // 1 = the pre-4.4 behaviour (one attempt).
    maxAttempts: integer().notNull().default(1),
    // Which attempt counts in the gradebook when there are several.
    gradingMethod: gradingMethodEnum().notNull().default("highest"),
    // Gradebook category and release (4.6), as for assignments.
    gradeCategoryId: gradeCategoryRef(),
    gradesReleased: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.courseId, t.deadline),
    index().on(t.sectionId),
    sameCourseSection("quizzes_section_same_course_fk", t),
    sameCourseCategory("quizzes_grade_category_same_course_fk", t),
    unique("quizzes_id_course_unique").on(t.id, t.courseId),
    check("quizzes_time_limit_check", sql`${t.timeLimitMinutes} > 0`),
    check("quizzes_attempts_check", sql`${t.maxAttempts} between 1 and 10`),
    check("quizzes_opens_check", sql`${t.opensAt} is null or ${t.opensAt} < ${t.deadline}`),
  ],
);

/** "Random N questions from category X". Its pool is copied into `questions` (slot_id). */
export const quizSlots = pgTable(
  "quiz_slots",
  {
    id: uuid().primaryKey().defaultRandom(),
    quizId: uuid()
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    // Snapshot of where the pool came from (no FK: deleting a category never touches a quiz).
    categoryId: uuid().notNull(),
    categoryName: text().notNull(),
    pickCount: integer().notNull(),
    // Points for each picked question (so every attempt has the same total).
    points: integer().notNull().default(1),
  },
  (t) => [
    index().on(t.quizId),
    unique("quiz_slots_id_quiz_unique").on(t.id, t.quizId),
    check("quiz_slots_values_check", sql`${t.pickCount} > 0 and ${t.points} > 0`),
  ],
);

export const questions = pgTable(
  "questions",
  {
    id: uuid().primaryKey().defaultRandom(),
    quizId: uuid()
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    ...questionBody(),
    // Set for a random slot's pool question (each attempt is given only its picks).
    slotId: uuid(),
    // The bank question this was copied from (provenance only: no FK, a copy is not a link).
    bankQuestionId: uuid(),
  },
  (t) => [
    index().on(t.quizId),
    unique("questions_id_quiz_unique").on(t.id, t.quizId),
    foreignKey({ name: "questions_slot_same_quiz_fk", columns: [t.slotId, t.quizId], foreignColumns: [quizSlots.id, quizSlots.quizId] }),
    questionShapeCheck("questions_shape_check", t),
    check("questions_points_check", sql`${t.points} > 0`),
  ],
);

/**
 * Per-attempt presentation order. `optionOrders[questionId][displayIndex] = originalIndex`.
 * Neighbours see different orders, and the client only ever sends display indexes.
 * `questionOrder` lists exactly the questions this attempt was given (random-slot picks
 * included), so it also fixes WHICH questions count towards the attempt.
 */
export type AttemptLayout = { questionOrder: string[]; optionOrders: Record<string, number[]> };

export const attempts = pgTable(
  "attempts",
  {
    id: uuid().primaryKey().defaultRandom(),
    // RESTRICT: a quiz that students have attempted can't be deleted (that would erase grades).
    quizId: uuid()
      .notNull()
      .references(() => quizzes.id, { onDelete: "restrict" }),
    studentId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // 1, 2, ... up to the quiz's max_attempts (checked by a trigger).
    attemptNumber: integer().notNull().default(1),
    // The server's clock is the source of truth for the timer.
    startedAt: ts().notNull().defaultNow(),
    submittedAt: ts(),
    score: integer(),
    total: integer().notNull(),
    layout: jsonb().$type<AttemptLayout>(),
  },
  (t) => [
    // Each attempt number once per student per quiz, and at most one attempt open at a time.
    unique("attempts_quiz_student_number_unique").on(t.quizId, t.studentId, t.attemptNumber),
    uniqueIndex("attempts_one_open_idx").on(t.quizId, t.studentId).where(sql`${t.submittedAt} is null`),
    check("attempts_number_check", sql`${t.attemptNumber} >= 1`),
    index().on(t.studentId),
    unique("attempts_id_quiz_unique").on(t.id, t.quizId),
    check("attempts_score_check", sql`${t.score} is null or (${t.score} >= 0 and ${t.score} <= ${t.total})`),
    // A finished attempt always has a score, and an unfinished one never has.
    check("attempts_finished_check", sql`(${t.submittedAt} is null) = (${t.score} is null)`),
  ],
);

export const answers = pgTable(
  "answers",
  {
    attemptId: uuid()
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    // Denormalised so the database can prove the question belongs to the attempt's quiz.
    quizId: uuid().notNull(),
    // Exactly one response column is set, by question type.
    // Always ORIGINAL option indexes (mapped from display indexes on save).
    selectedIndex: integer(), // single choice, true/false
    selectedIndexes: integer().array(), // multiple answer
    textAnswer: text(), // short answer, as typed
    numberAnswer: doublePrecision(), // numerical
  },
  (t) => [
    primaryKey({ columns: [t.attemptId, t.questionId] }),
    index().on(t.questionId),
    foreignKey({ name: "answers_attempt_same_quiz_fk", columns: [t.attemptId, t.quizId], foreignColumns: [attempts.id, attempts.quizId] }).onDelete("cascade"),
    foreignKey({ name: "answers_question_same_quiz_fk", columns: [t.questionId, t.quizId], foreignColumns: [questions.id, questions.quizId] }),
    check("answers_selected_index_check", sql`${t.selectedIndex} between 0 and 5`),
    check("answers_one_response_check", sql`num_nonnulls(${t.selectedIndex}, ${t.selectedIndexes}, ${t.textAnswer}, ${t.numberAnswer}) = 1`),
    check(
      "answers_selected_indexes_check",
      sql`${t.selectedIndexes} is null or (cardinality(${t.selectedIndexes}) <= 6 and 0 <= all(${t.selectedIndexes}) and 5 >= all(${t.selectedIndexes}))`,
    ),
    check("answers_text_length_check", sql`${t.textAnswer} is null or length(${t.textAnswer}) <= 500`),
  ],
);

/**
 * Gradebook overrides (4.6): the value the gradebook uses instead of the calculated one,
 * for one item (an assignment or a quiz) or, with neither set, for the course total.
 * Student work (submissions, attempts, scores) is never changed. Removing an override
 * sets its value(s) to NULL with a reason; the row stays so its history keeps pointing at it.
 */
export const gradeOverrides = pgTable(
  "grade_overrides",
  {
    id: uuid().primaryKey().defaultRandom(),
    courseId: courseRef(),
    studentId: uuid()
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    assignmentId: uuid(),
    quizId: uuid(),
    // Item override: points that count instead of the calculated value (NULL = removed).
    points: doublePrecision(),
    // Course total override: a percentage and/or a letter of the course's scale (both NULL = removed).
    percent: doublePrecision(),
    letter: text(),
    reason: text().notNull(),
    setBy: uuid()
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    unique("grade_overrides_target_unique").on(t.courseId, t.studentId, t.assignmentId, t.quizId).nullsNotDistinct(),
    index().on(t.studentId),
    foreignKey({ name: "grade_overrides_assignment_same_course_fk", columns: [t.assignmentId, t.courseId], foreignColumns: [assignments.id, assignments.courseId] }).onDelete("restrict"),
    foreignKey({ name: "grade_overrides_quiz_same_course_fk", columns: [t.quizId, t.courseId], foreignColumns: [quizzes.id, quizzes.courseId] }).onDelete("restrict"),
    // A course letter must be a band of the course's scale (so it can't be removed while used).
    foreignKey({ name: "grade_overrides_letter_in_scale_fk", columns: [t.courseId, t.letter], foreignColumns: [gradeBands.courseId, gradeBands.letter] }).onDelete("restrict"),
    check("grade_overrides_target_check", sql`num_nonnulls(${t.assignmentId}, ${t.quizId}) <= 1`),
    check(
      "grade_overrides_value_check",
      sql`case when ${t.assignmentId} is null and ${t.quizId} is null
        then ${t.points} is null and (${t.percent} is null or (${t.percent} >= 0 and ${t.percent} <= 100))
        else ${t.percent} is null and ${t.letter} is null and (${t.points} is null or ${t.points} >= 0) end`,
    ),
    check("grade_overrides_reason_check", sql`length(btrim(${t.reason})) between 1 and 1000`),
  ],
);

/** Append-only history of every override and removal (written by a trigger, 0007). */
export const gradeOverrideEvents = pgTable(
  "grade_override_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    overrideId: uuid()
      .notNull()
      .references(() => gradeOverrides.id, { onDelete: "restrict" }),
    courseId: uuid().notNull(),
    studentId: uuid().notNull(),
    assignmentId: uuid(),
    quizId: uuid(),
    oldPoints: doublePrecision(),
    newPoints: doublePrecision(),
    oldPercent: doublePrecision(),
    newPercent: doublePrecision(),
    oldLetter: text(),
    newLetter: text(),
    reason: text().notNull(),
    changedBy: uuid()
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.courseId, t.createdAt), index().on(t.overrideId)],
);

export const liveSessions = pgTable(
  "live_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    courseId: courseRef(),
    sectionId: sectionRef(),
    title: text().notNull(),
    startsAt: ts().notNull(),
    durationMinutes: integer().notNull(),
    // Random, unguessable Jitsi room name.
    room: text().notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.courseId, t.startsAt),
    index().on(t.sectionId),
    sameCourseSection("live_sessions_section_same_course_fk", t),
    check("live_sessions_duration_check", sql`${t.durationMinutes} > 0`),
  ],
);

/** Manual "mark as done" for resources and live sessions (quizzes/assignments complete on submit). */
export const completions = pgTable(
  "completions",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: uuid().notNull(),
    courseId: courseRef(),
    completedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] }), index().on(t.userId, t.courseId)],
);

/* ============================== community ============================== */

/** Discussion threads. Announcements are instructor-only threads that notify everyone. */
export const threads = pgTable(
  "threads",
  {
    id: uuid().primaryKey().defaultRandom(),
    courseId: courseRef(),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text().notNull(),
    body: text().notNull(),
    isAnnouncement: boolean().notNull().default(false),
    pinned: boolean().notNull().default(false),
    locked: boolean().notNull().default(false),
    createdAt: createdAt(),
    lastActivityAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index().on(t.courseId, t.lastActivityAt),
    index().on(t.authorId),
    index("threads_announcements_idx").on(t.courseId, t.createdAt).where(sql`${t.isAnnouncement}`),
  ],
);

export const posts = pgTable(
  "posts",
  {
    id: uuid().primaryKey().defaultRandom(),
    threadId: uuid()
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.threadId, t.createdAt), index().on(t.authorId)],
);

export const boards = pgTable(
  "boards",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Set when an instructor shares the board read-only with a course.
    sharedCourseId: uuid().references(() => courses.id, { onDelete: "set null" }),
    title: text().notNull(),
    scene: jsonb().$type<{ elements: unknown[]; files?: Record<string, unknown> }>().notNull(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.ownerId), index().on(t.sharedCourseId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text().notNull(),
    body: text(),
    link: text(),
    readAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.userId, t.createdAt),
    // The unread badge runs on every page.
    index("notifications_unread_idx").on(t.userId).where(sql`${t.readAt} is null`),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text().notNull(),
    done: boolean().notNull().default(false),
    dueDate: ts(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId)],
);

/* ============================== attendance ============================== */
/*
 * Phase 3. Policy is configuration, never code: the minimum percentage (if any) and how
 * much a "late" counts are per-course settings (no university policy is assumed, D3).
 * Every change to a record is logged by a database trigger into attendance_events
 * (append-only), so no code path can skip the history. See docs/DATABASE.md.
 */

export const attendanceStatusEnum = pgEnum("attendance_status", ["present", "absent", "late", "excused"]);
export const correctionStatusEnum = pgEnum("correction_status", ["pending", "approved", "rejected"]);

export const attendanceSettings = pgTable(
  "attendance_settings",
  {
    courseId: uuid()
      .primaryKey()
      .references(() => courses.id, { onDelete: "cascade" }),
    // Minimum attendance shown to students and staff; null = no threshold configured.
    thresholdPercent: integer(),
    // How much a "late" counts towards attendance (100 = like present, 0 = like absent).
    lateCreditPercent: integer().notNull().default(100),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    check("attendance_settings_threshold_check", sql`${t.thresholdPercent} is null or ${t.thresholdPercent} between 0 and 100`),
    check("attendance_settings_late_check", sql`${t.lateCreditPercent} between 0 and 100`),
  ],
);

export const attendanceSessions = pgTable(
  "attendance_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    courseId: courseRef(),
    // Optional: the class section this meeting was for (its roster comes from student_sections).
    sectionId: uuid().references(() => classSections.id, { onDelete: "restrict" }),
    // Optional: the live class this meeting was held as (for future automatic capture).
    liveSessionId: uuid().references(() => liveSessions.id, { onDelete: "set null" }),
    heldAt: ts().notNull(),
    topic: text(),
    createdBy: uuid()
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.courseId, t.heldAt)],
);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    // RESTRICT: a session with records can't be deleted (attendance is an academic record).
    sessionId: uuid()
      .notNull()
      .references(() => attendanceSessions.id, { onDelete: "restrict" }),
    studentId: uuid()
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    status: attendanceStatusEnum().notNull(),
    markedBy: uuid()
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    markedAt: ts().notNull().defaultNow(),
    // Why it was set or changed (e.g. "correction approved"); copied into the history.
    note: text(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.studentId] }), index().on(t.studentId)],
);

/** Append-only history of every attendance mark and change (written by a trigger). */
export const attendanceEvents = pgTable(
  "attendance_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    sessionId: uuid()
      .notNull()
      .references(() => attendanceSessions.id, { onDelete: "restrict" }),
    studentId: uuid()
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    oldStatus: attendanceStatusEnum(),
    newStatus: attendanceStatusEnum().notNull(),
    changedBy: uuid()
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    reason: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.sessionId, t.studentId, t.createdAt)],
);

export const attendanceCorrections = pgTable(
  "attendance_corrections",
  {
    id: uuid().primaryKey().defaultRandom(),
    sessionId: uuid()
      .notNull()
      .references(() => attendanceSessions.id, { onDelete: "restrict" }),
    studentId: uuid()
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    requestedStatus: attendanceStatusEnum().notNull(),
    reason: text().notNull(),
    status: correctionStatusEnum().notNull().default("pending"),
    requestedAt: createdAt(),
    decidedBy: uuid().references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    decidedAt: ts(),
    decisionNote: text(),
  },
  (t) => [
    index().on(t.sessionId),
    index().on(t.studentId),
    // At most one open request per student per session.
    uniqueIndex("attendance_corrections_one_pending_idx").on(t.sessionId, t.studentId).where(sql`${t.status} = 'pending'`),
    check("attendance_corrections_decision_check", sql`(${t.status} = 'pending') = (${t.decidedAt} is null)`),
  ],
);
