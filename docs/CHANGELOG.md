# Changelog

## 4.6.0: Phase 3, gradebook: categories and weights, scale as data, overrides, release (2026-11-28, built, in QA)

Grading policy (decision D4) is still open, so nothing here assumes Graphic Era's scheme: every course keeps exactly the old gradebook until its staff change it.

**Database (migration `0007_gradebook`, additive)**
- `courses.grade_total_method` (`points` default = the old calculation, or `weighted`). New tables `grade_categories` (name, weight 0–100), `grade_bands` (the course's scale: letter, label, minimum %, grade points), `grade_overrides` and `grade_override_events`. `assignments` and `quizzes` get `grade_category_id` (composite FK keeps it in the same course) and `grades_released` (default true).
- **Back-fill:** every existing course gets today's 10-point scale as data; new courses get it from a trigger. Existing courses stay in points mode with every item released, so every number, letter and GPA is unchanged.
- **Rules in the database:** override target is at most one item and can't change; values in range (item points ≥ 0 and ≤ the assignment's maximum, course percent 0–100, course letter must be a band of the course's scale); non-empty reason; the student is enrolled; every override and removal is written to `grade_override_events` by a trigger, which is append-only. An assignment's maximum can't drop below an override (extends the existing trigger). Plan and rollback: `DATABASE.md`.

**Staff**
- **Gradebook setup** page (`course.manage`): choose the total method; create, rename, re-weight and remove categories in one save (weights must total 100 in weighted mode, checked on the server); give each assignment and quiz a category and choose whether its grades are released; edit the grade scale (minimums strictly descending, a band at 0, unique letters, points ≥ 0; "Use the default 10-point scale" resets it). Placeholders only ("e.g. Internal assessment"), no pre-filled category names.
- **Weighted total** = Σ(weight × category %) over categories with counted items, re-normalised over those categories' weights. **Uncategorised items are refused in weighted mode**: switching is refused until every item has a category, and new or edited items in a weighted course must name one (the builders show a "Gradebook category" select when the course has categories).
- **Overrides** page: staff with `grade.edit` (TAs included) override one item's points for one student; staff with `course.manage` override a course total (percentage, letter or both). A reason is mandatory, including to remove one. Active overrides and the full history (who, old, new, reason, when) are listed. Submissions, attempts and their scores are never changed.
- Gradebook table and CSV show each item's category and release state, per-category percentages, the weighted total when used, the letter from the course's scale, and override markers (CSV: an "Overridden" column).
- Releasing an item's grades notifies the class. Grading an unreleased assignment doesn't notify the student.

**Students**
- Unreleased items show **"Not released"**; they don't count in the total, the category breakdown or the GPA the student sees. Their grade, feedback, feedback files, quiz scores, answer key and per-question marks are removed on the server (page payload, feedback file downloads, notifications).
- The course Grades tab shows each item's category, a "By category" breakdown (released items only), the course's own scale, and a note when a value or the course total was set by the instructor (reasons are staff-only).
- The Grades page uses each course's scale for the letter and grade points (identical for courses on the default scale).

**Seed**
- CS201 uses weighted categories **"Labs (sample)" 60% and "Quizzes (sample)" 40%** (sample data, not a policy); Lab 4's grades are not released; Diya Negi's (24CS1003) Quiz 1 is overridden to 5/5 with a sample reason.

**Limitations**
- Not yet verified as an upgrade of a seeded 0006 database, nor on PostgreSQL (QA).
- The "before/after" proof is a unit-level equivalence test of the calculation (old code copied as reference, 2,000 random gradebooks); comparing real seeded gradebooks before and after the migration is left to QA.
- A course total override is shown to the student (as their total) even if some items are unreleased. Status leak: a student whose unreleased assignment was graded sees that the submission can no longer be changed.
- Releasing grades and changing categories need `course.manage` (TAs can't). Overrides don't notify the student.
- Weights are re-normalised over categories with counted work; there is no option to treat empty categories as 0.

**Tests**
- New `tests/unit/gradebook.test.ts` (15 checks: default path equals the pre-4.6 calculation, weighted totals and re-normalisation, scales as data and their validation, course overrides). `test:unit` goes to 68. No new browser suite (QA to follow).

## 4.5.0: Phase 3, assignments: several files, versions, feedback files, bulk download (2026-11-28, built, in QA)

**Database (migration `0006_assignment_versions`, additive)**
- `assignments.max_files` (1–20, default 1 = the previous behaviour). New tables `submission_versions`, `submission_files` and `feedback_files`.
- `submissions` is still the one graded row per student; `text`, `file_id` and `submitted_at` now mirror the **latest** version, so grades, grade history, the grading queue, the gradebook and late flags read exactly what they did before.
- **Back-fill:** every existing submission becomes version 1 with its text, time and (single) file. Verified on PGlite by upgrading a 0005 database holding a graded and an ungraded submission: submissions and grade history unchanged, two versions and one version file created.
- **Rules in the database:** versions and their file links are append-only; a graded submission accepts no new version; version numbers are consecutive; a version's files belong to the course and were uploaded by the submitting student; a version holds at most `max_files` files when written; feedback files belong to the submission's course; RESTRICT keys stop versions, their files and feedback files from being deleted as a side effect. Plan and rollback: `DATABASE.md`.

**Students**
- An assignment can accept several files (the setting is shown on the page, with the limits: up to N files, 8 MB in total per upload, the allowed types). Each file passes the existing checks (type, contents match the extension, 8 MB).
- Every (re)submission before grading is saved as a **new version**. When resubmitting, the files of the latest version are listed with "Keep" ticks; unticked files are left out of the new version but stay in the earlier one. The page shows a "Submission history" with every version, its time, a Late badge and its files.
- Files chosen together are checked in the browser against the count and the 8 MB total before anything is sent, and again on the server.
- Feedback files from the grader appear with the grade (not before).

**Staff**
- "Maximum files per submission" in the assignment form (create and edit). Lowering it never removes files already submitted.
- The grading view shows the latest version (the one being graded), the version history, and a "Files for the student" box: graders (`grade.edit`, so teaching assistants too) attach files (up to 10 per submission) and can remove them (logged in the audit log). Attaching after grading notifies the student.
- **Download all (ZIP)** on the grading page: the latest version of every submission, one folder per student named with the university ID, the online text as `online-text.txt`, plus `submissions.csv` (student, folder, version, time, late, number of files). Names are sanitised (no separators, no `.`/`..`, no Windows device names) and duplicates numbered. Built with a small store-only ZIP writer in `src/lib/zip.ts` (no new dependency), streamed one file at a time. Graders only: students get 401, staff of other courses 404. Each download is logged in the audit log.

**Security**
- Feedback files: course staff, and the student who owns the submission **once it is graded**; anyone else gets 404 (`getFileForUser`).
- Students' PDFs still always download (never inline); feedback PDFs uploaded by staff open inline like course materials.

**Seed**
- CS201 "Lab 2: Singly linked list" accepts 3 files. Ananya Rao (24CS1001) submitted it twice (version 1: one file; version 2: two files, graded 18/20) and has a feedback file `lab2-feedback.pdf`. All other seeded submissions are version 1.

**Limitations**
- **Reopening a graded submission is not built** (spec: optional). Once graded, the student can't submit again; staff can still change the grade.
- The request limit stays at 9 MB (`serverActions.bodySizeLimit`), so all files sent in one submission share 8 MB. Several large files need several submissions (keep the earlier files ticked).
- The ZIP is not compressed (student files are mostly already compressed formats) and has no ZIP64 support (4 GB / 65,535 entries; far above course scale).
- Feedback files are not versioned and are not tied to a particular version (they belong to the submission, whose latest version is the graded one).

**Tests**
- New `tests/unit/submissions.test.ts` (12 checks: CRC-32, ZIP read-back, safe names and path traversal, duplicate names, multi-file limits). `test:unit` goes to 53.
- No new browser suite (QA to follow). Dev checks: typecheck, lint, build, unit, migrate + seed from scratch; `test:e2e` 42/42 and `test:security` 10/10 against a fresh seed with the new code.

## 4.4.0: Phase 3, question bank, question types and attempts (2026-11-28, built, in QA)

**Database (migration `0005_question_bank`, additive)**
- New tables: `question_categories`, `bank_questions`, `quiz_slots`. New enums `question_type` and `grading_method`.
- New columns with defaults that keep today's behaviour: questions get a type (single choice) and points (1); quizzes get an optional opening time, a maximum number of attempts (1) and a grading method (highest); attempts get an attempt number (1); answers get columns for multiple-answer, short-answer and numerical responses.
- **Rules in the database:** each question type's answer key must be complete and in range (CHECK on quiz and bank questions); exactly one response per answer; an answer must be for a question the attempt was given; attempt numbers stay within the quiz's maximum and can't start before it opens; the maximum can't drop below an attempt already made; random slots are frozen with the questions once anyone starts; one open attempt per student per quiz.
- Existing quizzes, attempts and answers keep their scores (verified on PGlite by upgrading a 0004 database with a scored attempt). Plan and rollback: `DATABASE.md`.

**Question bank** (course page → Question bank)
- Per-course categories and questions with free-text tags; filter by category, type, tag or words in the question.
- Staff with `course.manage` create, edit and delete; teaching assistants see it read-only.
- **Department sharing:** staff who manage a course can browse the banks of other courses in the same department and **copy** questions into their own bank. Courses in other departments, and courses with no department, are never listed or reachable (the page and the copy action both 404).
- **Snapshots, not links:** a quiz always holds its own copy of a question. Editing or deleting a bank question never changes a quiz or a score. To pick up bank edits, re-save the quiz before anyone starts.

**Question types** (all graded on the server)
- Single choice (as before), multiple answer (all-or-nothing, stated in the builder and to students), true/false, short answer (one or more accepted answers; trimmed, case-insensitive, whitespace collapsed, otherwise exact), numerical (value ± tolerance, inclusive).
- Each question has points (whole number 1–100, default 1); the attempt total is the sum.

**Quizzes**
- Fixed questions (typed in, drafted with AI, or added from the bank) and **random slots**: "N questions from category X, P points each". Each attempt draws its own picks when it starts, preferring the pool questions given least often so far, so students who start one after another get different questions when the category is big enough. N can't exceed the category's size.
- Optional **opening time** (enforced on the server and in the database; students see when it opens).
- **Multiple attempts** (1–10, default 1) with a grading method: highest, average (2 decimals), first or last. The gradebook, course totals, analytics, the quiz CSV and the student's page all use the value that counts. Each attempt has its own timer, layout and picks. Policy is a per-quiz choice; no university rule is assumed.
- Answer keys (correct options, accepted answers, numerical values and tolerances) are still sent to students only after the deadline.
- Analytics show per-type breakdowns (option counts, most common typed answers); the CSV has one row per student with the graded score and every attempt's score.

**Fixes found while building**
- Course progress counted each attempt; it now counts each quiz once.

**Tests**
- New `tests/unit/questions.test.ts` (14 checks: answer checking per type, scoring, grading methods, validation, random picks). `test:unit` goes to 43.
- No new browser suite yet (QA in progress). `test:db` (36), `test:e2e` (42) and `test:stability` (15) pass unchanged.

## 4.3.0: Phase 3, attendance (2026-11-27)

**Database (migration `0004_attendance`, additive)**
- New tables: attendance settings, sessions, records, history and correction requests.
- **History in the database.** A trigger writes every mark and every change to append-only history (old status, new status, who, reason), so no code path can skip it.
- **Enrolment check.** A trigger refuses marks for students not enrolled in the course.
- Plan and rollback: `DATABASE.md`.

**Taking attendance** (course page → Attendance tab)
- **Who can mark.** Instructors, coordinators and teaching assistants (capability `attendance.mark`).
- **Starting a class.** Staff record a class with its date, time and topic. Optionally, they limit it to one class section, which narrows the roster to students placed in that section for the course's term.
- **The sheet.** It has present, late, absent and excused for each student, and "Mark all present". It saves in one transaction; unchanged marks aren't rewritten, so the history shows only real changes.

**Reports**
- A per-student summary with counts and a percentage, and a list of classes with counts.
- CSV export with a "Below minimum" column.
- **Percentage rule.** Attendance % = (present + late × late credit) ÷ (present + late + absent). Excused classes don't count.

**Policy is configurable, not assumed (D3)**
- Each course has an optional minimum percentage and a late credit (default 100%, the same as present).
- No minimum is set by default. Students below a configured minimum are flagged.

**Corrections**
- Students see their own attendance per course and can request a correction with a reason; one open request per class is allowed.
- Instructors and coordinators (`attendance.approve`) approve or decline it. Teaching assistants can't.
- Approval changes the mark, so the history records it. The student is notified either way.

**Accessibility fixes found while testing**
- The correction button's accessible name now contains its visible text (WCAG 2.5.3).
- The confirmation toast is no longer lost when the page refreshes and closes the dialog.

**Tests**
- New `test:attendance` suite (12 checks). It covers the default of no minimum, seeded percentages, section-limited sheets, saving, minimum flagging, the student view and correction request, approval and notification, and CSV. It also replays crafted Server Action calls: a student marking attendance and a TA deciding a correction are both refused.
- `test:unit` goes to 29 (attendance arithmetic) and `test:db` to 36 (enrolment check, history written and append-only, one open request, RESTRICT delete, value ranges).
- The accessibility scan now opens the Attendance tab for instructor and student and scans the attendance sheet page.

## 4.2.0: Phase 2b, department-scoped administration (2026-11-27)

No schema change: this release uses the `role_assignments` table from 0003.

**Department roles**
- Administrators assign department administrator, HOD or dean to staff accounts, on the new "Department roles" card in Academic structure.
- Role holders get a **department area**, `/instructor/department/[id]`, reached from their dashboard. There they manage their department's programmes, batches, class sections, section placements and course offerings: staff, linked sections and section enrolment. Other departments return 404, whether through the page or a crafted call.

**Authorization**
- Institution actions are scoped:
  - administrators: departments, sessions, terms and department roles;
  - department managers: their department's structure and offerings (moving a course between departments needs both);
  - course coordinators: their course's staff (new capability `staff.manage`).
- Changing the primary instructor stays with department managers and administrators.

**Editing the structure**
- Rename departments, programmes, batches and sections; edit terms (name and dates).
- Deactivate departments and programmes. Renaming a department updates its courses' display name.

**Interface**
- Shared `StructureView` and `CourseOfferingView` components, used by both the admin console and the department area.
- The course page's staff card lets coordinators add and remove staff.

**Sample data**
- Dr. Meera Iyer is HOD of Computer Science & Engineering.
- Prof. Sara Thomas coordinates HS101.

**Tests**
- `test:institution` grows from 14 to 21 checks. The new ones cover department-admin positive paths and cross-department crafted calls, plus coordinator positive and negative cases.
- `test:unit` goes to 25 and `test:db` to 30.
- The accessibility scan covers the department page.

## 4.1.0: Phase 2a, institutional foundation (2026-11-27)

**Academic structure (migration `0003_institution`, additive)**
- **The structure:** departments → programmes → batches → class sections; academic sessions → terms.
- **Placements:** students are placed in one class section per term, so a section change between terms keeps its history.
- **Admin page:** `/admin/structure`, for creating each level and placing students.

**Course offerings**
- Courses are linked to a department and a term.
- New admin course page `/admin/courses/[id]`: academic links, course staff, linked class sections, and enrolment of whole sections. Command palette entries now open it.

**Course staff and permissions**
- **Staff roles:** several coordinators, instructors and teaching assistants per course.
- **Capabilities:** authorisation now asks for a capability (`course.manage`, `grade.edit`, …) through `courseForInstructor(user, course, capability)`, which fails closed. Teaching assistants can view, grade and moderate, but not change a course; the interface hides what they can't use.
- **Database rules:** course staff must be instructor accounts, section members must be student accounts, and the primary instructor is always on the staff.

**Back-fill on upgrade**
- Departments are created from existing course department names, and each course is linked to its department.
- Each primary instructor becomes course staff.
- Terms are linked by an admin, not guessed.

**Sample data**
- Department/programme/session/term/batch/section structure, students in sections A and B, and a teaching assistant (`karan.mehra@eduwave.edu`) on CS201.
- Course terms now read "2026–27 · Odd semester".

**Tests**
- New `test:institution` suite (14 checks, including crafted-call attacks).
- `test:db` goes from 22 to 29 checks; `test:unit` from 21 to 24.
- Accessibility scan now covers the new admin pages.

**Not yet (Phase 2b)**
- Department-scoped administration (`role_assignments` exists but isn't used yet).
- Editing and deactivating structure entries.
- Staff management by course coordinators.

## 4.0.2: audit and baseline (2026-11-27)

- **Audit documents:** `PRODUCT_VISION`, `REPOSITORY_AUDIT`, `FEATURE_INVENTORY`, `MOODLE_CAPABILITY_MATRIX` (checked against docs.moodle.org 5.3), `SECURITY_REVIEW` and `IMPLEMENTATION_ROADMAP`. ARCHITECTURE gains a target module map.
- **Cleanups:** removed unused `liveSessionsFor()` and `ProgressChart`; course colour swatches are now solid (no gradient); AI prompts address university students.
- **Unit tests:** new `test:unit` suite (21 checks, Node's built-in runner, no new dependency), run in CI.

## 4.0.1: stabilisation (2026-11-27)

**CI**
- Fixed the failing typecheck in GitHub Actions. Route helper types (`PageProps`, `LayoutProps`, `RouteContext`) are generated by Next.js and didn't exist on a clean checkout; `typecheck` now runs `next typegen && tsc --noEmit`.
- Actions updated to `checkout@v5` and `setup-node@v5`, which drops the Node 20 deprecation warning.
- CI now also runs on pushes to any branch.

**Database (migration `0002_completions_integrity`, additive only)**
- Completion ticks must name a resource or live session of the same course.
- Deleting an item removes its ticks (triggers).
- Progress ignores orphaned ticks left from before.
- Section changes take a course-row lock: no duplicate positions. `moveSection` renumbers and repairs existing duplicates.
- Plan and rollback are documented in `docs/DATABASE.md`.

**Performance**
- **Pagination:** users and audit log, 50 per page with exact totals; the audit log can be filtered by event and shows who acted.
- **Command palette:** a capped, lightweight query.
- **Notification bell:** polls a 2-query summary, and fetches the list only when something changed.
- **Instructor dashboard:** queries now run in parallel.
- **CSV import:** checks for duplicates within the file, one existence query, batched inserts.
- **Gradebook:** the abandoned-attempt sweep is scoped to the student when only one student is shown.

**Interface**
- **Calendar on phones:** an agenda list instead of the cramped month grid.
- **Form controls** honour a caller's width. This fixes the stacked filter bars on the admin users and audit pages.

**Tests**
- `test:db` grows to 22 checks (completion integrity).
- Three test selectors fixed: two now target the visible element now that the calendar and the audit filter contain duplicate text, and one waits for streamed content. The assertions themselves are unchanged.

## 4.0.0: production hardening (2026-11-27)

Driven by the production audit (`docs/PRODUCTION_AUDIT.md`). **Upgrading:** take a backup, then run `npm run db:migrate` (`docs/DATABASE.md`).

**Breaking changes**
- **`npm start` now runs in `production` mode by default.** It needs PostgreSQL (`DATABASE_URL`) and an https `APP_URL`, and refuses sample data. For a production build on one machine with PGlite (tests, labs), set `EDUWAVE_ENV=local`.
- **`npm run db:seed` refuses to run in production mode.**
- **Removed** the confetti effect and its `canvas-confetti` dependency.

**Security**
- Fixed thread-moderation mass assignment (High).
- Unpublished courses no longer leak through the calendar, notifications or board list.
- Trusted-proxy-aware client IP (`TRUSTED_PROXY_HOPS`).
- One lockout budget per account; an admin password reset unlocks the account.
- A temporary password can't be used beyond the account page.
- The session is rotated on password change; current-password checks are rate-limited.
- Student PDFs always download. OOXML and WebP structure is checked on upload.
- Request-size cap on AI chat; board quota.
- Failed sign-ins for unknown accounts no longer store what was typed.
- Production configuration is validated at startup, and sample accounts are refused.

**Data integrity (migration `0001_integrity`)**
- **Foreign keys:** composite FKs keep sections, files and quiz answers within the same course or quiz.
- **CHECK constraints:** grades, scores, answer indexes, points and durations stay in range.
- **Delete protection:** `ON DELETE RESTRICT` on student work and on users with records.
- **Triggers:**
  - answers are frozen after scoring, and questions after the first attempt;
  - a grade can't exceed the maximum points;
  - the audit log and grade history are append-only.
- **Grade history:** new `grade_events` table and `submissions.graded_by`.
- **Audit log:** `audit_log.actor_id`, plus new events for publishing, enrolment, deletion and grades.
- **Transactions:**
  - quiz answers and finalisation take row locks, so they can't interleave;
  - editing a quiz and starting it can't race;
  - submitting and grading are locked, and a grade is refused if the student resubmitted since the grader looked;
  - deleting an activity is transactional.
- **Abandoned quiz attempts** are scored with their real end time.

**Grading policy**
- The letter grade follows the displayed whole-number percentage.
- Missing work counts as 0 only after the late window closes.
- The answer key is revealed only after the grace period.

**Performance**
- **Gradebook:** Map lookups instead of nested scans, SQL question counts, only the needed columns, and single-student filtering in SQL.
- **Bulk enrolment:** one insert, one notification batch, one email.
- **File downloads:** authorised on metadata before the content is read.
- **Indexes:** missing foreign-key and hot-path indexes added, including partial indexes for unread notifications, ungraded submissions and announcements.
- **Admin overview:** statistics come from one query.

**Interface**
- **Design system:** a restrained institutional palette (navy and blue, WCAG AA in light and dark), a tighter radius scale, flat primary buttons, neutral avatars, and course colour used only as thin strips.
- **Removed decoration:** gradients, glows, glass panels, entrance animations, emoji and playful copy.
- **Landing page:** the fabricated mock dashboard and an unbacked claim are gone.
- **Dashboard numbers** now say exactly what they count: active accounts, finished work, and failed sign-ins in the last 24 hours.
- Notifications without a link are no longer dead `#` links.

**Testing and operations**
- **New test suites:** `test:db` (19 checks, including real concurrency) and `test:security` (10 replayed attacks).
- **CI:** GitHub Actions workflow.
- **Backups:** PostgreSQL `pg_dump`/`pg_restore` backup verified.
- **New docs:** `.env.production.example`, SECURITY, DATABASE, DEPLOYMENT, TESTING and ARCHITECTURE.

## 3.2.0 (2026-11-27)
- Backup and restore scripts; accessibility scan with all WCAG 2.1 A/AA violations fixed.

## 3.1.0 (2026-11-27)
- Editing of assignments and quizzes; graded work protected from deletion; error and not-found pages; stability suite.

## 3.0.0 (2026-11-27)
- University LMS: admin console, courses and enrolment, sections, assignments, gradebook, discussions, calendar.

## 2.0.0 (2026-11-26) and 1.0.0
- Uploads, live classes, whiteboards, optional AI, notifications. Next.js rebuild of the original MERN project.
