/**
 * Database schema.
 *
 * Compared with the original MongoDB models (mostly `Mixed` fields), every
 * relationship here is an explicit foreign key, and quiz attempts are their own
 * table instead of arrays copied into both the student and the quiz documents.
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

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ["teacher", "student"]);

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    role: roleEnum().notNull(),
    name: text().notNull(),
    // Teachers sign in with email, students with a roll number issued by their teacher.
    email: text().unique(),
    rollNumber: text().unique(),
    passwordHash: text().notNull(),
    // Set when a teacher issues/resets a password: the student must choose their own.
    mustChangePassword: boolean().notNull().default(false),
    // Students belong to exactly one class (same as the original app).
    classId: uuid().references((): AnyPgColumn => classes.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.classId)],
);

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 of the cookie token. A leaked database row cannot be replayed as a cookie.
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
    userAgent: text(),
  },
  (t) => [index().on(t.userId)],
);

/** Login throttling stored in the DB, so it works across server instances/restarts. */
export const loginThrottle = pgTable("login_throttle", {
  key: text().primaryKey(),
  failures: integer().notNull().default(0),
  windowStart: timestamp({ withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp({ withTimezone: true }),
});

/** Security-relevant events, shown to users on their Security page. */
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
  (t) => [index().on(t.userId, t.createdAt)],
);

export const classes = pgTable(
  "classes",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    teacherId: uuid()
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.teacherId, t.name)],
);

export const quizzes = pgTable(
  "quizzes",
  {
    id: uuid().primaryKey().defaultRandom(),
    classId: uuid()
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    title: text().notNull(),
    subject: text().notNull(),
    timeLimitMinutes: integer().notNull(),
    deadline: timestamp({ withTimezone: true }).notNull(),
    shuffle: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.classId)],
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
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp({ withTimezone: true }),
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

/** Uploaded files live in Postgres: no paid object storage needed for class-sized use. */
export const files = pgTable("files", {
  id: uuid().primaryKey().defaultRandom(),
  classId: uuid()
    .notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
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
    classId: uuid()
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    title: text().notNull(),
    subject: text().notNull(),
    // Exactly one of url / fileId is set.
    url: text(),
    fileId: uuid().references(() => files.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.classId)],
);

export const liveSessions = pgTable(
  "live_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    classId: uuid()
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    title: text().notNull(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    durationMinutes: integer().notNull(),
    // Random, unguessable Jitsi room name.
    room: text().notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.classId, t.startsAt)],
);

export const boards = pgTable(
  "boards",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Set when a teacher shares the board read-only with a class.
    sharedClassId: uuid().references(() => classes.id, { onDelete: "set null" }),
    title: text().notNull(),
    scene: jsonb().$type<{ elements: unknown[]; files?: Record<string, unknown> }>().notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.ownerId), index().on(t.sharedClassId)],
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
    readAt: timestamp({ withTimezone: true }),
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
    dueDate: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId)],
);
