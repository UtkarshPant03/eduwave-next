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

```bash
npm run db:migrate        # applies pending migrations; running it again is a no-op
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
| One submission per student per assignment; one attempt per student per quiz | UNIQUE constraints |
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

## Transactions and locking

| Operation | Protection |
|---|---|
| Saving a quiz answer | Locks the attempt row (`FOR UPDATE`) and checks it is still open, in the same transaction. |
| Finalising an attempt | Same lock, then counts correct answers and records the score. A save and a finalisation can't interleave. Tested with real concurrency on PostgreSQL. |
| Starting a quiz vs. editing its questions | The quiz row is locked `FOR SHARE` / `FOR UPDATE`, so no attempt snapshots questions that are about to change. |
| Submitting vs. grading an assignment | Both lock the submission row. A grade also carries the version (submission time) the grader saw, and is refused if the student resubmitted meanwhile. |
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
