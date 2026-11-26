/**
 * Database schema (LMS).
 *
 * Core idea, as in Moodle: users ENROL in many COURSES; a course is organised into
 * SECTIONS (weeks/topics) that contain ACTIVITIES (resources, assignments, quizzes,
 * live sessions). Every relationship is a foreign key; integrity rules (one attempt
 * per quiz, one submission per assignment) are database constraints, not app code.
 */
import {
  type AnyPgColumn,
  boolean,
  customType,
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
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    action: text().notNull(),
    detail: text(),
    ip: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.createdAt)],
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
  (t) => [unique().on(t.code, t.term), index().on(t.instructorId)],
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
  (t) => [index().on(t.courseId, t.position)],
);

const sectionRef = () => uuid().references(() => sections.id, { onDelete: "set null" });
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
});

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
  (t) => [index().on(t.courseId)],
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
  (t) => [index().on(t.courseId)],
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid().primaryKey().defaultRandom(),
    assignmentId: uuid()
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text(),
    fileId: uuid().references(() => files.id, { onDelete: "set null" }),
    submittedAt: ts().notNull().defaultNow(),
    grade: integer(),
    feedback: text(),
    gradedAt: ts(),
  },
  // One submission per student per assignment (resubmitting updates it).
  (t) => [unique().on(t.assignmentId, t.studentId), index().on(t.studentId)],
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
  (t) => [index().on(t.courseId)],
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
  (t) => [index().on(t.quizId)],
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
    quizId: uuid()
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    studentId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The server's clock is the source of truth for the timer.
    startedAt: ts().notNull().defaultNow(),
    submittedAt: ts(),
    score: integer(),
    total: integer().notNull(),
    layout: jsonb().$type<AttemptLayout>(),
  },
  // One attempt per student per quiz, enforced by the database itself.
  (t) => [unique().on(t.quizId, t.studentId), index().on(t.studentId)],
);

export const answers = pgTable(
  "answers",
  {
    attemptId: uuid()
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    // Always the ORIGINAL option index (mapped from the display index on save).
    selectedIndex: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.attemptId, t.questionId] })],
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
  (t) => [index().on(t.courseId, t.startsAt)],
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
  (t) => [index().on(t.courseId, t.lastActivityAt)],
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
  (t) => [index().on(t.threadId, t.createdAt)],
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
  (t) => [index().on(t.userId, t.createdAt)],
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
