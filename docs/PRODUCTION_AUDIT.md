# eduWave production audit

**Date:** 2026-11-27 · **Commit audited:** `070a1cd` (master) · **Scope:** whole repository.

**Method:** four independent read-only reviews traced actual execution paths (authorization; database
integrity and transactions; files, XSS, headers and configuration; UI/UX and performance). The
highest-impact findings were then re-checked by hand. README claims were not taken on trust.

**Status (updated 2026-11-27 after remediation, see docs/SECURITY.md and docs/CHANGELOG.md).** Values: *Open* · *Fixed* (with the test that proves it) · *Accepted* (documented risk and
reason) · *Deferred* (planned, not done).

---

## 1. Architecture (as found)

| Layer | Implementation |
|---|---|
| Framework | Next.js 16.4 App Router: Server Components, Server Actions, `cacheComponents`/PPR, `proxy.ts` |
| Language | TypeScript strict; Zod 4 validation in actions |
| Database | Drizzle ORM 0.45 → node-postgres when `DATABASE_URL` is set, otherwise PGlite (WASM Postgres 17) in `./.pglite` |
| Auth | Custom: bcryptjs (cost 12); random 32-byte session token in an httpOnly cookie, SHA-256 hash in `sessions`; DB-backed lockout |
| Authorization | `src/lib/auth/dal.ts` (who) + `src/lib/access.ts` (which course), 404 on deny |
| Files | Stored in Postgres (`files.data` bytea), served by `src/app/files/[fileId]/route.ts` after an ACL check |
| Integrations | Jitsi (link-out to a random room), Excalidraw (self-hosted assets), Ollama (optional, server-side) |
| Tests | `tests/e2e.mjs` (42 checks), `tests/stability.mjs` (15), `tests/a11y.mjs` (axe); no unit tests; no CI |

**Feature claims checked:** question banks and attendance are **not implemented**; quizzes allow
exactly one attempt (enforced by a unique constraint); there is no password-reset-by-email flow
(administrators reset passwords).

---

## 2. Security findings

| ID | Sev. | Finding | Files | Status |
|---|---|---|---|---|
| SEC-01 | **High** | **Mass assignment in `moderateThread`.** The client object goes straight into `.set()`, so an instructor can rewrite any thread column: move a thread into another course, change its author, title or body, or make it an announcement. | `src/app/actions/community.ts:75` | **Fixed** (security.mjs) |
| SEC-02 | Medium | **Unpublished-course leaks.** For courses students are enrolled in but which aren't published: the calendar shows their deadlines, `notifyCourse` notifies and emails students about them, and the board list shows boards shared with them. | `calendar-page.tsx`, `lib/data/shared.ts`, `lib/notify.ts` | **Fixed** (security.mjs) |
| SEC-03 | Medium | **Login IP throttle and audit IP use the leftmost `X-Forwarded-For`, which the client controls.** Faking it bypasses the per-IP limit (enabling password spraying and CPU use through bcrypt), lets an attacker lock out a whole NAT, and forges the IPs in the audit log. | `lib/audit.ts:9`, `actions/auth.ts` | **Fixed** (security.mjs) |
| SEC-04 | Medium | **Anyone can lock out an account by guessing its ID.** Student IDs are sequential. One account can also be guessed under two throttle keys (email and ID), giving 10 tries instead of 5. | `actions/auth.ts`, `lib/auth/throttle.ts` | **Fixed** double budget; targeted lockout *Accepted* (SECURITY.md) |
| SEC-05 | Medium | **Production silently falls back to PGlite** when `DATABASE_URL` is missing. There is no environment validation; `APP_URL` silently defaults to localhost, and a partial SMTP configuration silently disables email. | `src/db/index.ts:21`, `lib/notify.ts` | **Fixed** (startup probes) |
| SEC-06 | Medium | **The seed can run against production**, creating publicly documented sample credentials (`eduwave2026`), including an admin account. | `scripts/seed.ts` | **Fixed** (startup probes) |
| SEC-07 | Low | **The forced password change is enforced only by the role helpers**, not by `requireUser`, the board, task and notification actions, or the route handlers (file download, CSV exports, APIs). | `lib/auth/dal.ts` | **Fixed** (security.mjs) |
| SEC-08 | Low | **Session not rotated after a password change**, and the current-password check has no rate limit. | `actions/auth.ts:74` | **Fixed** (security.mjs) |
| SEC-09 | Low | **Student PDFs are served inline** on the LMS origin to the instructor reviewing them. | `lib/uploads.ts:30`, `files/[fileId]/route.ts` | **Fixed** (security.mjs) |
| SEC-10 | Low | **Magic-byte check gaps.** OOXML is accepted on any ZIP header (no `[Content_Types].xml` check), and WebP on any RIFF header. | `lib/uploads.ts` | **Fixed** (security.mjs) |
| SEC-11 | Low | **AI chat route reads an unbounded JSON body** (Server Action size limits don't apply to route handlers). There is no per-user cap on boards. | `api/ai/chat/route.ts`, `actions/boards.ts` | **Fixed** |
| SEC-12 | Low | **Failed-login identifiers are logged verbatim.** A password typed into the ID field would be stored and shown to admins. | `actions/auth.ts:51` | **Fixed** (security.mjs) |
| SEC-13 | Low | **`deleteActivity` reveals other courses' work counts.** It counts submissions or attempts before checking which course the activity belongs to. | `actions/instructor.ts:222` | **Fixed** (security.mjs) |
| SEC-14 | Low | **CSP allows `'unsafe-inline'` scripts.** Next.js inline bootstrap scripts need it unless every page uses per-request nonces. | `next.config.ts` | *Accepted* (SECURITY.md) |
| SEC-15 | Low | **On public meet.jit.si the join window is UI-only.** A forwarded link works at any time, and the first signed-in participant becomes moderator. | `lib/live.ts` | *Accepted*: self-host Jitsi + JWT for production |
| SEC-16 | Info | **Admin role reach.** Admins act as managers in discussions (they can post announcements and moderate) and can download any course file. An instructor can re-publish a course an admin hid. | `lib/access.ts`, `actions/instructor.ts` | *Accepted*: all admin actions audited with actor |

**Verified sound:**
- **Files and redirects:** file ACL (students can't read others' submissions; unpublished and other courses are blocked); allow-list MIME types with `nosniff`; RFC 5987 filenames; no path traversal (files live in the DB); `safeNext` open-redirect guard.
- **XSS and CSV:** the Markdown renderer builds React elements only (no raw HTML; links limited to http/https); CSV formula escaping.
- **Sessions and login:** hashed session tokens; httpOnly, SameSite=Lax and Secure cookies; deactivation revokes access immediately; generic login errors plus dummy hashing (no account enumeration).
- **Request protection and secrets:** Server Action Origin checks (CSRF); HSTS only in production; no secrets in git history.
- **Quiz answer key:** never sent to the client before the student has submitted and the deadline has passed.

## 3. Data-integrity findings

| ID | Sev. | Finding | Files | Status |
|---|---|---|---|---|
| DB-01 | **High** | **Abandoned quiz attempts are never finalised** unless that student reopens the quiz. Until then the gradebook shows "missing, 0" and analytics are wrong; a late reopen records `submitted_at = now()`, weeks after the deadline. | `lib/quiz-engine.ts`, `lib/data/gradebook.ts` | **Fixed** (stability.mjs) |
| DB-02 | **High** | **Answers can change after scoring.** `saveAnswer` is check-then-write with no lock, and `finalizeAttempt` counts and updates in separate statements. A save that races finalisation is stored after grading, or the score misses it. | `actions/student.ts:152`, `lib/quiz-engine.ts:53` | **Fixed** (db-integrity, concurrent on PostgreSQL) |
| DB-03 | **High** | **`updateQuiz` can replace questions while `startAttempt` reads them.** The attempt's layout then points at deleted questions, so the student sees zero questions. | `actions/instructor.ts`, `actions/student.ts:128` | **Fixed** (locks + trigger) |
| DB-04 | **High** | **Grade changes leave no history and no grader identity.** No audit events exist for grading, enrolment, publishing or deletions. | `actions/instructor.ts`, `lib/audit.ts`, `schema.ts` | **Fixed** (grade_events) |
| DB-05 | Medium | **Grading and resubmission race.** A resubmission can overwrite work that was just graded, and a grade can land on a version the grader never saw. | `actions/student.ts:78`, `actions/instructor.ts` | **Fixed** |
| DB-06 | Medium | **Submission file replacement isn't transactional,** so files can be orphaned or lost. | `actions/student.ts:85` | **Fixed** |
| DB-07 | Medium | **`deleteActivity` count-then-delete can still cascade-delete student work.** The foreign keys are `ON DELETE CASCADE`. | `actions/instructor.ts`, `schema.ts` | **Fixed** (RESTRICT + tx) |
| DB-08 | Medium | **Cross-course and cross-quiz rules are enforced only in app code.** `section_id` isn't tied to the same course, `answers` isn't tied to the attempt's quiz, `completions.item_id` has no foreign key (orphans can push progress above 100%), and resources' "url or file" isn't enforced. | `schema.ts` | **Fixed** except completions.item_id (no FK; cleaned on delete) *Deferred* |
| DB-09 | Medium | **No CHECK constraints.** Grades ≥ 0, score ≤ total, valid answer indexes, positive points and time limits, and so on are enforced only by Zod. | `schema.ts` | **Fixed** (db-integrity) |
| DB-10 | Medium | **Missing indexes** on foreign-key and hot paths: `answers(question_id)`, `resources(file_id)`, `submissions(file_id)`, section ids, calendar ranges, unread notifications, ungraded submissions, announcements. | `schema.ts` | **Fixed** |
| DB-11 | Low | **Grading-policy inconsistencies.** The letter grade comes from the unrounded % while the UI shows the rounded value; work is marked "missing" while the late window is still open. | `lib/grading.ts`, `lib/data/gradebook.ts` | **Fixed** |
| DB-12 | Low | **Audit-log weaknesses.** Rows cascade-delete with the user. Admin actions are attributed to the target, with the admin named only by email in free text. Audit writes run outside the action's transaction. | `schema.ts`, `actions/admin.ts` | **Partly fixed**: actor_id, RESTRICT, append-only; audit writes still outside the action transaction |
| DB-13 | Low | **Other edge cases.** `addSection` position race; the app clock and the DB clock are mixed in quiz timing; the answer key is revealed during the 10-second grace period after the deadline; unenrolling a student hides their grades from exports. | various | **Partly fixed**: answer-key grace fixed; addSection race and exports of unenrolled students *Deferred*; clock skew *Accepted* |

## 4. Performance findings (summary)

| ID | Finding | Status |
|---|---|---|
| PERF-01 | The student grades page runs the whole course gradebook (all students) once per course: N+1, filtered in JavaScript. | **Partly fixed**: student filtered in SQL; still one query set per course |
| PERF-02 | The gradebook does `find()` inside students × items loops (quadratic) and selects large text columns it doesn't need. | **Fixed** |
| PERF-03 | The instructor course page loads all five tabs (~20 queries) on every visit and after every action. | *Deferred* |
| PERF-04 | File downloads read the blob before authorizing the request. | **Fixed** |
| PERF-05 | Unbounded lists with no pagination: users (capped at 500), audit log (fixed at 200), admin courses, catalogue, threads, replies, participants, grading page. | *Deferred*: pagination not yet added |
| PERF-06 | Bulk enrolment and CSV import run row by row (thousands of sequential queries). | **Fixed** for enrolment; CSV user import still sequential *Deferred* |
| PERF-07 | Notification polling makes 4 queries per tab every 30 s; admin stats run 6 full-table counts on each load. | **Partly fixed**: admin stats one query; polling unchanged |
| PERF-08 | Calendar and command palette use heavy listing queries just to get course ids. | **Partly fixed**: calendar fixed; palette *Deferred* |

## 5. UI/UX findings (summary)

| ID | Finding | Status |
|---|---|---|
| UI-01 | **"AI-generated" look**, built mostly from six global primitives (`.bg-brand`, `.text-gradient`, `.bg-mesh`, `.bg-dots`, `.card-hover`, `.stagger`): gradient buttons, gradient course covers and hero, glass header, fade-in on every card, an uppercase eyebrow on every header, emoji and playful copy, confetti. | **Fixed** (tokens, primitives, landing, login, shell) |
| UI-02 | **No consistent design system:** three different primary-button styles, seven border radii, arbitrary font sizes, two greens, five widths for the right-hand column, and two kinds of empty state. | **Partly fixed**: shared tokens/radii/primitives; some one-off page classes remain |
| UI-03 | **Fabricated content on the landing page:** a mock dashboard with invented student, courses and percentages, and a promise of a "class average" chart that is never rendered. | **Fixed** |
| UI-04 | **Misleading dashboard numbers:** admin "Submissions" counts quizzes still in progress; Students/Instructors include deactivated accounts; "failed sign-ins" covers only the last 12 rows; instructor "Students" double-counts. | **Fixed** |
| UI-05 | **Dead ends:** "Forgot password?" goes nowhere, there is no admin course detail page (the palette entries all point to one list), notifications without a link use `href="#"`, and there is no full notifications page. | **Partly fixed**: dead notification links fixed ("Forgot password" is guidance text, not a link); admin course detail page and full notifications page *Deferred* |
| UI-06 | **Mobile:** the calendar month grid is unreadable at 375 px; many touch targets are smaller than 40 px; the delete button on to-do items only appears on hover. | *Deferred*: mobile calendar agenda view; targets meet the WCAG 2.2 AA 24px minimum but some are below 40px |
| UI-07 | **No search, sort or pagination** on the gradebook, the audit log, admin courses, discussions or participants. | *Deferred* |

## 6. Testing and deployment gaps

- **No CI.** Tests only run when someone runs them by hand.
- **No unit or integration tests** for concurrency (quiz races, double submission).
- **Never run on a real PostgreSQL server.** Migrations and the app were only exercised on PGlite until this audit. A throwaway PostgreSQL 18 instance is now used for testing.
- **No production environment template** and no deployment guide (Docker, reverse proxy, HTTPS).
- **Backups:** tested for PGlite only. The `pg_dump` path is untested.
