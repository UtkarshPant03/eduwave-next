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

/* ============================== courses ============================== */

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
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.code, t.term), index().on(t.instructorId), check("courses_credits_check", sql`${t.credits} >= 0`)],
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
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.courseId, t.dueAt),
    index().on(t.sectionId),
    sameCourseSection("assignments_section_same_course_fk", t),
    check("assignments_points_check", sql`${t.maxPoints} > 0 and ${t.lateDays} >= 0`),
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
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.courseId, t.deadline),
    index().on(t.sectionId),
    sameCourseSection("quizzes_section_same_course_fk", t),
    check("quizzes_time_limit_check", sql`${t.timeLimitMinutes} > 0`),
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
    prompt: text().notNull(),
    options: text().array().notNull(),
    // Never sent to students before the deadline. Grading happens on the server.
    correctIndex: integer().notNull(),
    explanation: text(),
  },
  (t) => [
    index().on(t.quizId),
    unique("questions_id_quiz_unique").on(t.id, t.quizId),
    check(
      "questions_options_check",
      sql`cardinality(${t.options}) between 2 and 6 and ${t.correctIndex} >= 0 and ${t.correctIndex} < cardinality(${t.options})`,
    ),
  ],
);

/**
 * Per-attempt presentation order. `optionOrders[questionId][displayIndex] = originalIndex`.
 * Neighbours see different orders, and the client only ever sends display indexes.
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
    // The server's clock is the source of truth for the timer.
    startedAt: ts().notNull().defaultNow(),
    submittedAt: ts(),
    score: integer(),
    total: integer().notNull(),
    layout: jsonb().$type<AttemptLayout>(),
  },
  (t) => [
    // One attempt per student per quiz, enforced by the database itself.
    unique().on(t.quizId, t.studentId),
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
    // Always the ORIGINAL option index (mapped from the display index on save).
    selectedIndex: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.attemptId, t.questionId] }),
    index().on(t.questionId),
    foreignKey({ name: "answers_attempt_same_quiz_fk", columns: [t.attemptId, t.quizId], foreignColumns: [attempts.id, attempts.quizId] }).onDelete("cascade"),
    foreignKey({ name: "answers_question_same_quiz_fk", columns: [t.questionId, t.quizId], foreignColumns: [questions.id, questions.quizId] }),
    check("answers_selected_index_check", sql`${t.selectedIndex} between 0 and 5`),
  ],
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
