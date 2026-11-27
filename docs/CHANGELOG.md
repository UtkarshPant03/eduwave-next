# Changelog

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
