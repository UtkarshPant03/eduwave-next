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

```bash
npm run db:migrate        # applies pending migrations; running it again is a no-op
```

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
