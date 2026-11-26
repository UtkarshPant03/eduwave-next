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
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["teacher", "student"]);

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  role: roleEnum().notNull(),
  name: text().notNull(),
  // Teachers sign in with email, students with a roll number issued by their teacher.
  email: text().unique(),
  rollNumber: text().unique(),
  passwordHash: text().notNull(),
  // Students belong to exactly one class (same as the original app).
  classId: uuid().references((): AnyPgColumn => classes.id, { onDelete: "set null" }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  // SHA-256 of the cookie token. A leaked database row cannot be replayed as a cookie.
  id: text().primaryKey(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
});

export const classes = pgTable(
  "classes",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    teacherId: uuid()
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.teacherId, t.name)],
);

export const quizzes = pgTable("quizzes", {
  id: uuid().primaryKey().defaultRandom(),
  classId: uuid()
    .notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  title: text().notNull(),
  subject: text().notNull(),
  timeLimitMinutes: integer().notNull(),
  deadline: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const questions = pgTable("questions", {
  id: uuid().primaryKey().defaultRandom(),
  quizId: uuid()
    .notNull()
    .references(() => quizzes.id, { onDelete: "cascade" }),
  position: integer().notNull(),
  prompt: text().notNull(),
  options: text().array().notNull(),
  // Never sent to students. Grading happens on the server.
  correctIndex: integer().notNull(),
});

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
  },
  // One attempt per student per quiz, enforced by the database itself.
  (t) => [unique().on(t.quizId, t.studentId)],
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
    selectedIndex: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.attemptId, t.questionId] })],
);

export const resources = pgTable("resources", {
  id: uuid().primaryKey().defaultRandom(),
  classId: uuid()
    .notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  title: text().notNull(),
  subject: text().notNull(),
  url: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  text: text().notNull(),
  done: boolean().notNull().default(false),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
