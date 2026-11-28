# Database

eduWave uses PostgreSQL through Drizzle ORM. The schema is in `src/db/schema.ts`; the versioned SQL migrations are in `drizzle/`.

| Environment | Database |
|---|---|
| `development` and `local` | PGlite (PostgreSQL 17 compiled to WebAssembly), stored in `./.pglite`. No install needed. |
| `production` | PostgreSQL 15 or newer, set with `DATABASE_URL`. Required: the app refuses to start without it. |

## Migrations

| File | Contents |
|---|---|
| `0000_lms.sql` | Base schema: users, sessions, courses, enrolments, sections, content, assessments, community. |
| `0001_integrity.sql` | Database-level integrity (below). Adds columns, constraints, indexes and triggers; deletes no rows. |
| `0002_completions_integrity.sql` | Completion ticks must reference a real item of the same course. |
| `0003_institution.sql` | Academic structure, course staff and department roles (Phase 2; plan below). |
| `0004_attendance.sql` | Attendance: settings, sessions, records, append-only history and correction requests (Phase 3; plan below). |
| `0005_question_bank.sql` | Question bank, question types and points, random slots, open date, multiple attempts (Phase 3; plan below). |
| `0006_assignment_versions.sql` | Assignments: several files per submission, submission versions, feedback files (Phase 3; plan below). |

```bash
npm run db:migrate        # applies pending migrations; running it again is a no-op
```

### Plan for `0006_assignment_versions` (Phase 3, written before the change)

**Status.** Implemented in 4.5.0 (in QA). Verified on PGlite: fresh install (migrate + seed) and an upgrade of a 0005 database holding a graded submission with a file and an ungraded text-only one (submissions and grade history unchanged; two version-1 rows and one version file created; the new triggers refused a version on the graded submission, a gap in version numbers, edits/deletes of versions, deleting a version's file and another student's file). **Not yet verified on PostgreSQL.**

**Design choice: `submissions` stays the graded row; versions hang off it.** One `submissions` row per student per assignment remains (grade, feedback, grader, grade history and the grading queue are untouched). Every (re)submission adds a read-only **version** under it. `submissions.submitted_at` and `submissions.text` keep mirroring the **latest** version, and `submissions.file_id` its first file, so every existing query (gradebook, queue, progress, late flags) keeps working unchanged. Files of earlier versions are no longer deleted on resubmission; a file kept from one version to the next is referenced again, not copied.

**Change.** Additive: one new column with a default that keeps today's behaviour, three new tables, triggers.

| Object | Change |
|---|---|
| `assignments.max_files` | New, `integer NOT NULL DEFAULT 1`, CHECK 1–20. 1 = today's behaviour (one file) |
| `submission_versions` (new) | `submission_id` (RESTRICT), `version_number` (≥ 1, UNIQUE per submission), `text`, `submitted_at`. Late is derived as today (`submitted_at > due_at`) |
| `submission_files` (new) | `(version_id, file_id)` primary key, `position`. Both FKs RESTRICT |
| `feedback_files` (new) | `submission_id` (RESTRICT), `file_id` (UNIQUE, RESTRICT), `uploaded_by`, `created_at` |

**Back-fill.** Every existing submission becomes **version 1** with its text and `submitted_at`; its `file_id` (if any) becomes that version's only file. Grades, feedback, `grade_events`, the grading queue and the gradebook read `submissions` and are therefore unchanged.

**Rules enforced by the database:**
- Versions and their file links are **append-only** (the existing `eduwave_append_only()` trigger), and RESTRICT foreign keys mean a submission, version or file that is part of student work can't be deleted as a side effect.
- A version can't be added to a graded submission; version numbers are consecutive per submission (trigger).
- A version's files belong to the assignment's course and were uploaded by the submitting student; a version holds at most the assignment's `max_files` files at the time it is written (trigger; lowering `max_files` later never touches older versions).
- A feedback file belongs to the submission's course (trigger).

**Rollback.** Discards versions before the latest one and all feedback files (take a backup first).

```sql
DROP TRIGGER submission_versions_append_only ON submission_versions;  DROP TRIGGER submission_files_append_only ON submission_files;
DROP TRIGGER submission_versions_rules ON submission_versions;  DROP TRIGGER submission_files_rules ON submission_files;
DROP TRIGGER feedback_files_rules ON feedback_files;
DROP FUNCTION eduwave_submission_version_rules(), eduwave_submission_file_rules(), eduwave_feedback_file_rules();
DROP TABLE feedback_files, submission_files, submission_versions;
ALTER TABLE assignments DROP CONSTRAINT assignments_max_files_check, DROP COLUMN max_files;
-- files that only older versions or feedback used stay in `files` (delete them by hand if wanted)
-- then remove 0006 from drizzle.__drizzle_migrations and drizzle/meta/_journal.json
```

### Plan for `0005_question_bank` (Phase 3, written before the change)

**Status.** Implemented in 4.4.0 (in QA). Verified on PGlite: fresh install (migrate + seed, `test:db` 36/36) and an upgrade of a 0004 database holding a scored attempt (score, total, answers unchanged; the attempt became attempt 1; a second attempt is still refused). **Not yet verified on PostgreSQL.**

**Design choice: snapshots, not live links.** A quiz never points at a bank question. Adding a bank question to a quiz **copies** it into `questions` (with `bank_question_id` kept only as provenance, without a foreign key). A random slot copies **every** question of its category into the quiz as that slot's pool when the quiz is saved; each attempt picks N of them when it starts and records the picks in `attempts.layout`. Consequences:
- Editing or deleting a bank question never changes a quiz, a started attempt or a score (spec criterion 3). The existing "questions are frozen once a student has started" trigger keeps protecting what attempts were given, including random pools.
- To pick up bank edits, staff re-save the quiz **before** anyone starts (the pool is re-copied on save). After the first attempt the pool is frozen with the rest of the quiz.

**Change.** Additive. Two new enums, three new tables, new nullable or defaulted columns, and replaced CHECK constraints that accept every existing row.

| Object | Change |
|---|---|
| enum `question_type` | `single`, `multiple`, `true_false`, `short_answer`, `numerical` |
| enum `grading_method` | `highest`, `average`, `first`, `last` |
| `question_categories` (new) | Per course: `name` (unique per course). A category with questions can't be deleted (RESTRICT) |
| `bank_questions` (new) | Per course: category (composite FK keeps it in the same course), type, prompt, options, answer key columns, points, explanation, free-text `tags`, author, timestamps |
| `quiz_slots` (new) | "Random N questions from category X": `quiz_id`, `position`, `category_id` and `category_name` (snapshot; no FK, so deleting a category never touches a quiz), `pick_count`, `points` per picked question |
| `questions` | New `type` (default `single`), `points` (default 1), `correct_indexes int[]`, `accepted_answers text[]`, `numeric_answer`, `tolerance`, `slot_id` (composite FK to `quiz_slots(id, quiz_id)`: pool questions belong to a slot of the same quiz), `bank_question_id` (provenance only). `correct_index` becomes nullable (short answer and numerical have no options) |
| `quizzes` | New `opens_at` (nullable), `max_attempts` (default 1), `grading_method` (default `highest`) |
| `attempts` | New `attempt_number` (default 1). UNIQUE `(quiz_id, student_id)` is replaced by UNIQUE `(quiz_id, student_id, attempt_number)` plus a partial unique index allowing **one open attempt** per student per quiz |
| `answers` | `selected_index` becomes nullable; new `selected_indexes int[]` (multiple answer), `text_answer` (short answer), `number_answer` (numerical). Exactly one of the four is set |

**Back-fill.** None needed beyond column defaults: existing questions become `single` worth 1 point, existing quizzes allow 1 attempt graded by `highest`, existing attempts become attempt 1, existing answers keep `selected_index`. Scores already stored are not recomputed; new scoring gives the same result for single-choice questions worth 1 point (1 point when `selected_index = correct_index`).

**Rules enforced by the database:**
- Question shape per type (CHECK on both `questions` and `bank_questions`): single choice 2–6 options with a valid `correct_index`; true/false exactly 2 options and index 0 or 1; multiple answer 2–6 options and 1..n valid `correct_indexes`; short answer no options and 1–20 accepted answers; numerical no options, a value and `tolerance >= 0`. Points > 0.
- Exactly one response column per answer; `selected_indexes` within 0–5.
- An answer's question must be one this attempt was given (trigger on `answers`, using `attempts.layout`; attempts without a layout, from before 4.0, are exempt).
- Attempt numbers are ≥ 1 and ≤ the quiz's `max_attempts`; an attempt can't start before `opens_at` (trigger on `attempts`).
- `max_attempts` between 1 and 10 and can't be lowered below an attempt number already used (trigger on `quizzes`); `opens_at` < `deadline`.
- `quiz_slots`: `pick_count` and `points` > 0; slots are frozen once anyone has started (same trigger function as questions).
- Slot pools stay in their quiz (composite FK).

**Rollback.** Only safe before any multi-attempt, non-single-choice or random-slot data exists (otherwise it discards that data; take a backup first).

```sql
DROP TRIGGER answers_in_attempt ON answers;  DROP TRIGGER attempts_rules ON attempts;
DROP TRIGGER quizzes_max_attempts_used ON quizzes;  DROP TRIGGER quiz_slots_frozen ON quiz_slots;
DROP FUNCTION eduwave_answer_in_attempt(), eduwave_attempt_rules(), eduwave_max_attempts_used();
DELETE FROM answers WHERE selected_index IS NULL;                 -- non-choice answers
DELETE FROM attempts WHERE attempt_number > 1;                    -- extra attempts (their answers cascade)
ALTER TABLE answers DROP CONSTRAINT answers_one_response_check, DROP CONSTRAINT answers_selected_indexes_check,
  DROP COLUMN selected_indexes, DROP COLUMN text_answer, DROP COLUMN number_answer, ALTER COLUMN selected_index SET NOT NULL;
DROP INDEX attempts_one_open_idx;
ALTER TABLE attempts DROP CONSTRAINT attempts_quiz_student_number_unique, DROP CONSTRAINT attempts_number_check, DROP COLUMN attempt_number,
  ADD CONSTRAINT "attempts_quizId_studentId_unique" UNIQUE (quiz_id, student_id);
-- questions of other types and random pools must be removed (only possible on quizzes nobody started) before:
ALTER TABLE questions DROP CONSTRAINT questions_shape_check, DROP CONSTRAINT questions_points_check, DROP CONSTRAINT questions_slot_same_quiz_fk,
  DROP COLUMN type, DROP COLUMN points, DROP COLUMN correct_indexes, DROP COLUMN accepted_answers, DROP COLUMN numeric_answer,
  DROP COLUMN tolerance, DROP COLUMN slot_id, DROP COLUMN bank_question_id, ALTER COLUMN correct_index SET NOT NULL,
  ADD CONSTRAINT questions_options_check CHECK (cardinality(options) between 2 and 6 and correct_index >= 0 and correct_index < cardinality(options));
ALTER TABLE quizzes DROP CONSTRAINT quizzes_attempts_check, DROP CONSTRAINT quizzes_opens_check,
  DROP COLUMN opens_at, DROP COLUMN max_attempts, DROP COLUMN grading_method;
DROP TABLE quiz_slots, bank_questions, question_categories;
DROP TYPE question_type, grading_method;
-- then remove 0005 from drizzle.__drizzle_migrations and drizzle/meta/_journal.json
```

### Plan for `0004_attendance` (Phase 3, written before the change)

**Status.** Implemented in 4.3 as planned. Verified on PGlite and PostgreSQL 18, both as an upgrade from a 0003 database (existing rows unchanged) and as a fresh install (`test:db`, 36 checks).

**Change.** Additive only: five new tables, two enums (`attendance_status`, `correction_status`) and three triggers; no existing table altered.

| Table | Contents |
|---|---|
| `attendance_settings` | One row per course: `threshold_percent` (nullable: no hard-coded university threshold, D3) and `late_credit_percent` (how much a "late" counts: 100 = as present, 0 = as absent) |
| `attendance_sessions` | A class meeting of a course: date and time, topic, optional class section, optional linked live class, who created it |
| `attendance_records` | One per student per session: present, absent, late or excused, plus who marked it and when |
| `attendance_events` | **Append-only history** written by a trigger on every insert or update of a record: old status, new status, actor, reason, time. No code path can skip it |
| `attendance_corrections` | Student requests (requested status + reason) and staff decisions (approved/rejected, decided by, note). One pending request per student per session |

**Rules enforced by the database:**
- A student can only be marked in a session of a course they are enrolled in.
- Percentages stay within 0–100.
- History rows can't be edited or deleted (the same append-only trigger as the audit log).
- A session can't be deleted once it has records.

**Rollback.**

```sql
DROP TABLE attendance_events, attendance_corrections, attendance_records, attendance_sessions, attendance_settings;
DROP FUNCTION eduwave_attendance_enrolled(), eduwave_attendance_history();
DROP TYPE attendance_status, correction_status;
-- then remove 0004 from drizzle.__drizzle_migrations and drizzle/meta/_journal.json
```

Rollback discards only attendance data.

### Plan for `0003_institution` (Phase 2, written before the change)

**Change.** Additive only:
- **New tables:** departments, programmes, academic sessions, terms, batches, class sections, `student_sections` (one class section per student per term), `course_sections`, `course_staff` (coordinator, instructor or teaching assistant) and `role_assignments` (department admin, HOD or dean).
- **Courses:** two new nullable columns, `courses.department_id` and `courses.term_id`.
- **Triggers:**
  - account-type checks: course staff must be instructors, section members must be students, and scoped roles go only to staff or admins;
  - the primary instructor (`courses.instructor_id`) is always on the course staff and can't be removed from it.

**Back-fill.**
1. A department is created for each distinct `courses.department` text, and courses are linked to it.
2. Each course's primary instructor is copied into `course_staff`.

Terms are **not** guessed from the free-text `courses.term`: an admin links them. No existing column is changed or dropped.

**Verified on 2026-11-27.**
- **PostgreSQL 18 upgrade** from 0002, using a real seeded database: 8 courses became 4 departments, all 8 courses were linked, and every course got its primary instructor as staff.
- **Fresh installs:** PGlite and PostgreSQL 18, with the integrity suite passing 29/29.
- **Re-running the migration** is a no-op.

**Rollback.**
```sql
DROP TRIGGER courses_primary_instructor_staff ON courses;
DROP TRIGGER course_staff_keep_primary ON course_staff;
DROP TRIGGER student_sections_persona ON student_sections;
DROP TRIGGER course_staff_persona ON course_staff;
DROP TRIGGER role_assignments_persona ON role_assignments;
DROP FUNCTION eduwave_require_persona(), eduwave_sync_primary_instructor(), eduwave_keep_primary_instructor();
ALTER TABLE courses DROP COLUMN department_id, DROP COLUMN term_id;
DROP TABLE role_assignments, course_staff, course_sections, student_sections, class_sections, batches, terms, academic_sessions, programmes, departments;
DROP TYPE course_staff_role, scoped_role;
-- then remove 0003 from drizzle.__drizzle_migrations and drizzle/meta/_journal.json
```

Rollback discards only the Phase 2 data (structure, staff assignments, placements). Courses, enrolments and all academic records are untouched.

### Plan for `0002_completions_integrity` (written before the change)

**Problem.** `completions.item_id` points at either a resource or a live session, so it has no foreign key. Two consequences:
- When an item is deleted through any path other than `deleteActivity`, its completion ticks stay behind, and progress counts them, so it can exceed 100%.
- A tick could also name an item from another course.

**Change.** Additive only: two trigger functions and three triggers. No column changes, and no existing row is modified or deleted.
1. `BEFORE INSERT OR UPDATE ON completions`: the item must be a resource or live session **of the same course**. Otherwise the statement is rejected (`P0001`).
2. `AFTER DELETE ON resources` and `ON live_sessions`: delete that item's completion ticks. A tick for a deleted item has no meaning.
3. **App:** progress counts only ticks whose item still exists, so orphans left over from before 0002 no longer inflate it. They can be removed with the optional SQL below.

**Pre-check.** None needed: existing rows aren't re-validated by a BEFORE trigger.

**Rollback.**
```sql
DROP TRIGGER completions_item_valid ON completions;
DROP TRIGGER resources_completions_cleanup ON resources;
DROP TRIGGER live_sessions_completions_cleanup ON live_sessions;
DROP FUNCTION eduwave_completion_item_valid(), eduwave_delete_item_completions();
DELETE FROM drizzle.__drizzle_migrations WHERE hash = '<hash of 0002>';   -- PostgreSQL; then remove 0002 from drizzle/meta/_journal.json
```

**Optional one-off cleanup of pre-existing orphans** (only after a backup):
```sql
DELETE FROM completions c WHERE NOT EXISTS (SELECT 1 FROM resources r WHERE r.id = c.item_id)
                            AND NOT EXISTS (SELECT 1 FROM live_sessions l WHERE l.id = c.item_id);
```

**Section positions (no schema change).** Every section change takes a lock on the course row and runs in one transaction, so concurrent adds can't produce duplicate positions. `moveSection` renumbers positions to 0..n-1 before swapping, which also repairs duplicates created before this fix. A `UNIQUE (course_id, position)` constraint was considered and rejected for now: swapping two positions would need it `DEFERRABLE`, which Drizzle's schema DSL can't express, and existing duplicates would make the migration fail.

**Changing the schema:** edit `src/db/schema.ts`, run `npm run db:generate`, then **read the generated SQL**. Hand-edit it where Drizzle can't express what's needed. Examples from `0001`:
- A NOT NULL column added to existing rows must be added nullable, back-filled, then made NOT NULL.
- UNIQUE constraints must be created before the composite foreign keys that reference them.

**Upgrading an existing database:** take a backup first. If existing rows violate a new constraint, the migration stops and names the constraint, and **nothing is applied**. Fix the data and run it again. Before relying on 0001, check for rows that would violate its constraints:

```sql
SELECT id FROM resources WHERE num_nonnulls(url, file_id) <> 1;              -- needs url XOR file
SELECT id FROM submissions s WHERE grade < 0 OR grade > (SELECT max_points FROM assignments a WHERE a.id = s.assignment_id);
SELECT id FROM attempts WHERE (submitted_at IS NULL) <> (score IS NULL);
```

**Verified migration paths (2026-11-27):** in each case the old code seeded a database, then the new migration upgraded it.
- PGlite: upgrade succeeded.
- PostgreSQL 18: upgrade succeeded.
- Fresh install on PostgreSQL 18: succeeded.
- Integrity tests: 19 of 19 passed on both engines (`npm run test:db`).

## Integrity rules enforced by the database

These hold even if application code has a bug, or someone edits the database by hand. Each one has a test in `tests/db-integrity.ts`.

| Rule | Mechanism |
|---|---|
| An activity's section belongs to the same course | Composite FK `(section_id, course_id) → sections(id, course_id)` |
| A resource's file belongs to the same course | Composite FK `(file_id, course_id) → files(id, course_id)` |
| An answer's question belongs to the attempt's quiz | `answers.quiz_id` + composite FKs to `attempts(id, quiz_id)` and `questions(id, quiz_id)` |
| One submission per student per assignment; each attempt number once per student per quiz, and at most one open attempt | UNIQUE constraints; partial unique index |
| Attempts stay within the quiz's maximum (default 1) and can't start before its opening time; the maximum can't drop below an attempt already made | Triggers on `attempts` and `quizzes` |
| Every question's answer key matches its type (options, correct option(s), accepted answers, value and tolerance); points > 0 | CHECK on `questions` and `bank_questions` |
| An answer is for a question its attempt was given (random picks included), with exactly one response column set | Trigger on `answers`; CHECK |
| Random slots can't change once anyone has started; a slot's pool belongs to the same quiz | Trigger on `quiz_slots`; composite FK |
| A bank question's category belongs to the same course; a category with questions can't be deleted | Composite FK, `ON DELETE RESTRICT` |
| Grades ≥ 0; valid answer indexes; score between 0 and total; positive points, time limits and durations; a resource has exactly one of URL or file | CHECK constraints |
| A finished attempt always has a score, and only a finished one does | CHECK constraint |
| Grade ≤ the assignment's maximum points; the maximum can't drop below an awarded grade | Triggers on `submissions` and `assignments` |
| Answers can't change once an attempt is scored | Trigger on `answers` |
| Questions can't change once any student has started the quiz | Trigger on `questions` |
| Student work is never deleted as a side effect (deleting an assignment, a quiz or a user) | `ON DELETE RESTRICT` |
| The audit log and grade history are append-only | Trigger (see *Retention* below) |
| Attendance is only recorded for students enrolled in the session's course | Trigger on `attendance_records` |
| Every attendance mark and change is written to an append-only history (old, new, who, reason) | Trigger on `attendance_records` → `attendance_events` |
| One open correction request per student per session; a request is decided exactly when it has a decision time | Partial unique index; CHECK constraint |
| An attendance session with records can't be deleted | `ON DELETE RESTRICT` |
| Submission versions and their file links can't be edited or deleted; a graded submission accepts no new version; version numbers are consecutive | Append-only trigger; trigger on `submission_versions` |
| A version's files belong to the assignment's course, were uploaded by the submitting student, and number at most `max_files` | Trigger on `submission_files` |
| A feedback file belongs to the submission's course; files used by versions or feedback can't be deleted | Trigger on `feedback_files`; `ON DELETE RESTRICT` |

## Transactions and locking

| Operation | Protection |
|---|---|
| Saving a quiz answer | Locks the attempt row (`FOR UPDATE`) and checks it is still open, in the same transaction. |
| Finalising an attempt | Same lock, then grades the answers to the questions the attempt was given (by type, in `src/lib/questions.ts`) and records the score. A save and a finalisation can't interleave. Tested with real concurrency on PostgreSQL (before 4.4) and PGlite. |
| Starting a quiz vs. editing its questions | The quiz row is locked `FOR SHARE` / `FOR UPDATE`, so no attempt snapshots questions (or random picks) that are about to change. A further attempt starts only after the previous one is closed; the attempt number is checked under the same lock and by UNIQUE constraints. |
| Submitting vs. grading an assignment | Both lock the submission row. A submission adds its version (numbered under that lock) in the same transaction; files inserted for it are rolled back if the submission was graded meanwhile. A grade also carries the version (submission time) the grader saw, and is refused if the student resubmitted meanwhile. |
| Grading | Grade, grader and a `grade_events` history row are written in one transaction. |
| Deleting an activity | Course ownership check, student-work check and delete happen in one transaction with a row lock. `ON DELETE RESTRICT` is the backstop. |

**Abandoned quiz attempts** (tab closed, connection lost) are closed by `finalizeExpiredAttempts()` before scores are read (gradebook, analytics, progress). The recorded finish time is the attempt's real end time.

## Grading policy

| Rule | How it is applied |
|---|---|
| What counts towards the course total | An item counts once graded, or once it is closed with nothing submitted (then it scores 0). |
| When an item closes | Assignments: due date + late window. Quizzes: the deadline. |
| Ungraded submissions | Don't count until graded. |
| Letter grade | Uses the **displayed whole-number percentage** (rounded half up), so the letter always matches the number shown. See `src/lib/grading.ts`. |
| Grade scale | A 10-point scale. To change it for an institution, edit `GRADE_SCALE`. |

## Backup and restore

| Database | Back up | Restore |
|---|---|---|
| PGlite | `npm run db:backup` (stop the app first) | `npm run db:restore -- backups/<file>.tar.gz` (the old data is moved aside, not deleted) |
| PostgreSQL | `npm run db:backup` (uses `pg_dump -Fc`; the app can keep running) | `npm run db:restore -- backups/<file>.dump --yes` (`pg_restore --clean`) |

Each PGlite backup is opened and read back before it is reported as successful.

Any failure, including a silent early exit, gives exit code 1, so a scheduler can alert you. The newest 14 backups are kept (`BACKUP_KEEP`).

**Verified 2026-11-27:**
- PGlite: back up, modify, then restore gave back the original row counts.
- PostgreSQL 18: `pg_dump`, then `pg_restore` into an empty database, gave identical counts of users, answers and audit rows, and all 6 triggers.

## Retention

- `sessions` and rate-limit rows: expired ones are deleted at each sign-in.
- `notifications`: kept.
- `audit_log` and `grade_events`: kept permanently and append-only. A database administrator can still run a deliberate retention job inside a transaction:
  ```sql
  BEGIN; SET LOCAL eduwave.allow_history_maintenance = 'on';
  DELETE FROM audit_log WHERE created_at < now() - interval '7 years';
  COMMIT;
  ```
- **Users are never deleted, only deactivated.** Their academic records reference them with `RESTRICT`.
