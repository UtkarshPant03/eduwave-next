# eduWave: Feature Catalogue & Project Guide

This document has two jobs:

1. **Feature tracker** for eduWave. Every feature has a stable ID (e.g. `CRS-03`) and a status.
   When a feature is added or changed, update its row and add an entry to the [changelog](#9-changelog).
2. **Project guide** for students building a similar learning management system (LMS). Use the
   catalogue as a requirements list: pick a scope tier, build to the acceptance criteria, and
   check your work against the security requirements and rubric.

> **For students:** you are expected to design and write your own implementation. eduWave is a
> reference to compare against *after* you've made your own design decisions, not code to copy.
> Every feature below can be built in many valid ways, and explaining *why* you chose yours is part
> of the assessment.

---

## Contents

1. [How to use this guide](#1-how-to-use-this-guide)
2. [Scope tiers](#2-scope-tiers)
3. [Feature catalogue](#3-feature-catalogue)
4. [Security requirements](#4-security-requirements)
5. [Quality requirements](#5-quality-requirements)
6. [Data model starter](#6-data-model-starter)
7. [Suggested milestones](#7-suggested-milestones)
8. [Assessment rubric](#8-assessment-rubric)
9. [Changelog](#9-changelog)
10. [Appendix: where features live in eduWave (for instructors)](#appendix-where-features-live-in-eduwave-for-instructors)

---

## 1. How to use this guide

- **Feature IDs** are `AREA-NN`. Use them in commit messages, issue titles and your report
  (e.g. `feat(ASG-04): late submission window`), so progress can be traced.
- **Tier** says how essential a feature is: **Core**, **Standard** or **Advanced** (see §2).
- **Acceptance criteria** are written to be *testable*. If you can't write a test or a manual test
  script for a criterion, your feature isn't done.
- **Status** (eduWave reference): ✅ implemented · 🟡 partial · ⬜ not implemented (good extension).

### Before you write code: problem discovery

An LMS is a well-known product category, so "we built an LMS" is not novel by itself. Before
building, answer in writing:

- **Who** exactly are your users (first-year students? part-time evening learners? lab instructors?)
  and what do they struggle with *today*? Interview at least 3 real users.
- **What exists** already (Moodle, Google Classroom, Canvas, your university's portal) and what
  specifically does it do badly for your users?
- **What will you do better**, and **how will you measure it** (task time, error rate, survey score,
  grading turnaround)? Decide the metric *before* you build.

Your differentiator might be one well-chosen Advanced feature done properly, not more features.

---

## 2. Scope tiers

| Tier | Meaning | Typical team / time |
|---|---|---|
| **Core** | Minimum viable LMS. Every project must have all Core features working end to end. | 2–3 students, ~6 weeks |
| **Standard** | What makes it usable for a real course. Most good projects reach this. | 3–4 students, ~10 weeks |
| **Advanced** | Distinguishing work. Pick 2–4, done well, rather than many done badly. | Any team aiming for top marks |

---

## 3. Feature catalogue

### 3.1 Authentication & accounts (`AUTH`)

| ID | Feature | Tier | Status | Acceptance criteria |
|---|---|---|---|---|
| AUTH-01 | Sign in with email or student ID + password | Core | ✅ | Valid credentials open the role's dashboard. Invalid ones show **one generic message** for unknown user, wrong password and deactivated account. |
| AUTH-02 | Secure sessions | Core | ✅ | Session token in an **httpOnly, SameSite** cookie (never `localStorage`). Server stores only a hash of the token. Sign-out deletes the server session. |
| AUTH-03 | Password hashing | Core | ✅ | Passwords hashed with bcrypt/argon2 (cost ≥ 10). Plain passwords are never stored or logged. |
| AUTH-04 | Role-based access (admin / instructor / student) | Core | ✅ | Each role only reaches its own area; visiting another role's URL redirects. Checked **on the server** for every page and action. |
| AUTH-05 | Provisioned accounts (no public sign-up) | Standard | ✅ | Admin creates users; a temporary password is generated and **shown once**. |
| AUTH-06 | Forced password change on first sign-in | Standard | ✅ | Users with an issued password can't use the app until they set their own. |
| AUTH-07 | Password policy | Standard | ✅ | ≥ 10 characters and not on a common-password list. No arbitrary symbol rules (see NIST SP 800-63B). |
| AUTH-08 | Account lockout / rate limiting | Standard | ✅ | 5 failures on one account (or 30 from one IP) in 15 min → temporary lock, **even with the right password**. Stored in the DB, not memory. |
| AUTH-09 | Active sessions & "sign out other devices" | Standard | ✅ | User sees devices signed in and can revoke others. Changing a password revokes other sessions. |
| AUTH-10 | Profile editing | Standard | ✅ | Name, department, programme, bio. |
| AUTH-11 | Return to requested page after sign-in | Standard | ✅ | `?next=` honoured **only** for the user's own area (no open redirect). |
| AUTH-12 | Self-service password reset by email | Advanced | ⬜ | Single-use, expiring token; same response whether or not the email exists. |
| AUTH-13 | Two-factor authentication (TOTP) | Advanced | ⬜ | Optional for students, required for admins; recovery codes. |
| AUTH-14 | Single sign-on (university SAML/OIDC) | Advanced | ⬜ | Users sign in with institutional accounts. |

### 3.2 Administration (`ADM`)

| ID | Feature | Tier | Status | Acceptance criteria |
|---|---|---|---|---|
| ADM-01 | User list with search & role filter | Core | ✅ | Filter state lives in the URL (shareable, survives reload). |
| ADM-02 | Create user (any role) | Core | ✅ | Validation errors shown inline; duplicate email/ID rejected. |
| ADM-03 | Bulk import users from CSV | Standard | ✅ | Row-level errors reported; valid rows still imported; credentials downloadable once. |
| ADM-04 | Reset a user's password | Standard | ✅ | New temp password shown once; all the user's sessions revoked. |
| ADM-05 | Deactivate / reactivate account | Standard | ✅ | Takes effect **immediately** (live sessions stop working); grades and posts are kept. Admin can't deactivate themselves. |
| ADM-06 | Create course & assign instructor | Core | ✅ | Code unique per term; optional auto-created weekly sections. |
| ADM-07 | Publish / hide course | Standard | ✅ | Hidden courses are invisible to students (even by direct URL). |
| ADM-08 | Site overview dashboard | Standard | ✅ | Counts by role, courses, enrolments, submissions; recent security events. |
| ADM-09 | Audit log | Standard | ✅ | Sign-ins, failures, lockouts, password changes, user/course changes, with time and IP. |
| ADM-10 | Terms/semesters & archiving | Advanced | ⬜ | Courses grouped by term; past terms read-only. |
| ADM-11 | Bulk enrolment by CSV (course roster upload) | Advanced | ⬜ | |
| ADM-12 | Backup & restore | Core | ✅ | One command; the backup is verified by reading it back; old backups rotated; a failure (even a silent one) exits non-zero; restore never deletes the current data. |

### 3.3 Courses & content (`CRS`)

| ID | Feature | Tier | Status | Acceptance criteria |
|---|---|---|---|---|
| CRS-01 | Course page with sections (weeks/topics) | Core | ✅ | Sections ordered; each holds activities of any type. |
| CRS-02 | Manage sections | Standard | ✅ | Add, rename, reorder, delete. Deleting a section **doesn't delete** its activities (they move to "General"). |
| CRS-03 | Materials: web links | Core | ✅ | Only `http(s)` URLs accepted (blocks `javascript:` links). |
| CRS-04 | Materials: file uploads | Standard | ✅ | Allow-list of types, size cap, **file content checked** (magic bytes), downloads restricted to course members. |
| CRS-05 | Completion tracking & progress | Standard | ✅ | Students tick materials done; assignments/quizzes complete on submission; progress % shown per course. |
| CRS-06 | Course catalogue | Standard | ✅ | Students browse published courses, search and filter by department. |
| CRS-07 | Self-enrolment with key | Standard | ✅ | Wrong key rejected; attempts rate-limited; key compared in constant time; key never sent to students. |
| CRS-08 | Instructor enrols / removes students | Core | ✅ | By email or student ID, in bulk; reports not-found entries. |
| CRS-09 | Course settings | Standard | ✅ | Title, description, cover colour, enrolment key, visibility. |
| CRS-10 | Participants list | Standard | ✅ | Instructor sees enrolled students with last sign-in. |
| CRS-11 | Activity restrictions (release dates, prerequisites) | Advanced | ⬜ | e.g. "Week 3 opens after Quiz 2 ≥ 50%". |
| CRS-12 | Course import/copy for a new term | Advanced | ⬜ | |
| CRS-13 | Groups within a course | Advanced | ⬜ | Group assignments and group-only discussions. |

### 3.4 Assignments (`ASG`)

| ID | Feature | Tier | Status | Acceptance criteria |
|---|---|---|---|---|
| ASG-01 | Create assignment | Core | ✅ | Title, instructions, due date, max points, section. Students notified. |
| ASG-02 | Markdown instructions with preview | Standard | ✅ | Rendered **without** raw HTML (no XSS). |
| ASG-03 | Submit text and/or file | Core | ✅ | One submission per student per assignment (DB constraint); resubmission updates it until graded. |
| ASG-04 | Deadline & late window | Standard | ✅ | Accepted until due + N days, marked **Late**; closed afterwards. Enforced on the server. |
| ASG-05 | Grading with feedback | Core | ✅ | Grade can't exceed max (server-checked); student notified. |
| ASG-06 | Grading view | Standard | ✅ | All enrolled students listed, incl. non-submitters; counts of submitted/to grade/graded; average. |
| ASG-07 | Grading queue across courses | Standard | ✅ | Instructor dashboard lists oldest ungraded submissions first. |
| ASG-08 | Submission privacy | Core | ✅ | A student can never read another student's submission or file (returns 404). |
| ASG-09 | Rubric-based grading | Advanced | ⬜ | Criteria × levels; grade computed from rubric. |
| ASG-10 | Plagiarism / similarity hints | Advanced | ⬜ | Compare text submissions within a course. |
| ASG-11 | Peer review | Advanced | ⬜ | Anonymous allocation of 2–3 reviewers per submission. |
| ASG-12 | Edit after publishing | Core | ✅ | Change title, instructions, dates, points, late window. Maximum can't drop below a grade already awarded; students notified when the deadline changes. |
| ASG-13 | Graded work can't be deleted | Core | ✅ | Deleting an assignment that has submissions is refused **by the server**, with a reason (a confirm dialog alone is not protection). |

### 3.5 Quizzes (`QZ`)

| ID | Feature | Tier | Status | Acceptance criteria |
|---|---|---|---|---|
| QZ-01 | Multiple-choice quiz builder | Core | ✅ | 2–6 options, one correct, optional explanation; reorder/duplicate questions. |
| QZ-02 | Server-side timer | Core | ✅ | Start time recorded by the server; changing the browser clock gives no extra time. |
| QZ-03 | Server-side grading | Core | ✅ | Client sends only answers; score computed on the server. |
| QZ-04 | Answer key protection | Core | ✅ | Correct answers **never** sent to the browser before the student submits **and** the deadline passes. |
| QZ-05 | One attempt per student | Core | ✅ | Enforced by a unique DB constraint (safe against double-clicks/races). |
| QZ-06 | Autosave each answer | Standard | ✅ | Reloading or losing connection keeps answers; auto-submit at zero. |
| QZ-07 | Per-student shuffling | Standard | ✅ | Question and option order shuffled per attempt; client sends display positions, server maps back. |
| QZ-08 | Results & explanations after deadline | Standard | ✅ | |
| QZ-09 | Quiz analytics | Standard | ✅ | Score distribution, per-question correct %, per-option pick counts, CSV export. |
| QZ-10 | AI-drafted questions (local model) | Advanced | ✅ | Drafts only; instructor reviews before publishing; rate-limited. |
| QZ-11 | Question bank & random selection | Advanced | ⬜ | |
| QZ-12 | Other question types (short answer, numeric, code) | Advanced | ⬜ | |
| QZ-13 | Accommodations (extra time per student) | Advanced | ⬜ | |
| QZ-14 | Edit quiz with fairness locks | Standard | ✅ | Everything editable until the first attempt; then questions and time limit lock; a passed deadline can't be reopened (answers are already visible). Quizzes with attempts can't be deleted. |

### 3.6 Grades (`GRD`)

| ID | Feature | Tier | Status | Acceptance criteria |
|---|---|---|---|---|
| GRD-01 | Gradebook (students × items) | Core | ✅ | Graded, awaiting-grade, missing and upcoming states visible. |
| GRD-02 | Clear totals policy | Standard | ✅ | Missing work counts 0 **after** the deadline; ungraded submissions don't count yet. Policy explained in the UI. |
| GRD-03 | Letter grades / 10-point scale | Standard | ✅ | Scale defined in one place and shown to students. |
| GRD-04 | Student grade view & running GPA | Standard | ✅ | Credit-weighted, labelled **provisional**. |
| GRD-05 | Gradebook CSV export | Standard | ✅ | Spreadsheet formula injection neutralised. |
| GRD-06 | Weighted categories (e.g. labs 40%, quizzes 20%) | Advanced | ⬜ | |
| GRD-07 | Grade overrides with audit trail | Advanced | ⬜ | |

### 3.7 Communication (`COM`)

| ID | Feature | Tier | Status | Acceptance criteria |
|---|---|---|---|---|
| COM-01 | Course discussions (threads + replies) | Standard | ✅ | Markdown, safe rendering; author or instructor can delete. |
| COM-02 | Announcements | Standard | ✅ | Instructor-only; pinned; notifies all enrolled students. |
| COM-03 | Moderation (pin, lock) | Standard | ✅ | Locked threads accept no replies (server-checked). |
| COM-04 | In-app notifications | Standard | ✅ | Bell with unread count; mark read / all read; polls while tab visible. |
| COM-05 | Email notifications (optional SMTP) | Advanced | ✅ | Sent **after** the response (a slow mail server never blocks the action); BCC; plain text. |
| COM-06 | Anti-spam rate limits | Standard | ✅ | Thread/reply creation limited per user per hour. |
| COM-07 | Real-time updates (SSE/WebSockets) | Advanced | ⬜ | |
| COM-08 | Direct messages | Advanced | ⬜ | |

### 3.8 Scheduling (`SCH`)

| ID | Feature | Tier | Status | Acceptance criteria |
|---|---|---|---|---|
| SCH-01 | Calendar (month view) | Standard | ✅ | Deadlines and live classes across all courses; done items marked. |
| SCH-02 | Upcoming deadlines list | Core | ✅ | Next 14 days on the dashboard, urgency highlighted. |
| SCH-03 | Live classes (Jitsi) | Standard | ✅ | Unguessable room names; join opens 15 min before start; students notified. |
| SCH-04 | iCal export / subscribe | Advanced | ⬜ | Per-user secret feed URL. |
| SCH-05 | Attendance | Advanced | ⬜ | |

### 3.9 Learning tools (`TOOL`)

| ID | Feature | Tier | Status | Acceptance criteria |
|---|---|---|---|---|
| TOOL-01 | Personal to-do list with due dates | Standard | ✅ | Optimistic UI updates. |
| TOOL-02 | Study timer (Pomodoro) | Standard | ✅ | Runs client-side; respects reduced motion. |
| TOOL-03 | Whiteboards (autosave, share read-only with a course) | Advanced | ✅ | Self-hosted assets (works offline / on campus LAN). |
| TOOL-04 | AI tutor (local open model) | Advanced | ✅ | Streams replies; hints over answers; rate-limited; hidden if not configured; no student data sent to third parties. |
| TOOL-05 | Course search / command palette (Ctrl+K) | Standard | ✅ | Only shows courses the user can access. |

### 3.10 Interface & experience (`UI`)

| ID | Feature | Tier | Status | Acceptance criteria |
|---|---|---|---|---|
| UI-01 | Responsive layout | Core | ✅ | No horizontal scrolling at 390 px width; mobile navigation drawer. |
| UI-02 | Light / dark / system theme | Standard | ✅ | No flash of wrong theme on load. |
| UI-03 | Loading states | Standard | ✅ | Skeletons on every navigation; no blank screens. |
| UI-04 | Toasts & inline form errors | Standard | ✅ | Form input kept when validation fails. |
| UI-05 | Accessibility basics | Core | ✅ | Labels on every input, keyboard reachable controls, visible focus, ARIA on custom widgets, colour never the only signal. An automated axe-core scan of every main page (light **and** dark theme) finds no WCAG 2.1 A/AA violations. |
| UI-06 | Charts with accessible fallbacks | Standard | ✅ | Every chart has a table view or text equivalent. |
| UI-07 | Breadcrumbs & clear navigation | Standard | ✅ | |
| UI-08 | Internationalisation (Hindi/regional languages) | Advanced | ⬜ | |
| UI-09 | Installable PWA / offline reading | Advanced | ⬜ | |
| UI-10 | Friendly error and not-found pages | Core | ✅ | Unexpected errors show a page with *Try again* and a reference code, never stack traces or SQL. A malformed ID in a URL gives *not found*, not a server error. |

---

## 4. Security requirements

These apply to **every** tier. A project with a working UI but failing these is not complete.

| # | Requirement | How to verify |
|---|---|---|
| S1 | **Authorise on the server for every request.** Hiding a button is not security. | Call an action/API directly (curl or browser devtools) as the wrong user: expect 401/404. |
| S2 | **Never trust the client** for scores, timers, roles, prices or IDs. | Edit a request in devtools; the server must reject or recompute. |
| S3 | **Ownership checks** on every record (course, submission, file, thread). | Change an ID in the URL to another user's/course's: expect 404, not data. |
| S4 | **Validate all input** with a schema (types, lengths, formats). | Send oversized or malformed input: expect a clear error, not a crash. |
| S5 | **No secrets in the frontend bundle** (API keys, DB URLs). | Search the built JS for keys. |
| S6 | **XSS-safe rendering** of user content (no raw `innerHTML`). | Post `<script>alert(1)</script>` in a discussion: shown as text. |
| S7 | **Upload safety**: type allow-list, size cap, content check, `nosniff`, access control. | Upload an HTML file renamed `.pdf`: rejected. |
| S8 | **Brute-force protection** on sign-in. | 6 wrong passwords: locked even with the right one. |
| S9 | **Security headers**: CSP, `frame-ancestors`, `nosniff`, HSTS in production. | Inspect response headers. |
| S10 | **Audit trail** for security events. | Check the log after sign-ins and password changes. |
| S11 | **Dependency hygiene.** | `npm audit --omit=dev` reports no known vulnerabilities, or each one is justified in writing. |
| S12 | **Privacy**: collect only what's needed; students can't see each other's grades or emails. | Review every page a student can open. |

---

## 5. Quality requirements

- **Testing:** an automated end-to-end test for each Core flow (eduWave's `tests/e2e.mjs` runs 42
  checks, and `tests/stability.mjs` 15 more: quiz timer expiry, email delivery to a fake SMTP server,
  edit/delete rules, malformed URLs). Add unit tests for pure logic (grading rules, timers, shuffling).
- **Accessibility:** run an automated checker (axe-core, free) on every page in every theme, then test
  by keyboard and screen reader. Don't fade text with `opacity` to show "inactive": it fails contrast.
- **Operations:** backups that are verified and restorable, and a written restore procedure.
- **Reproducibility:** one-command setup from a clean clone, seed data, documented environment variables.
- **Code quality:** typecheck and lint pass with zero errors; no dead code; comments explain *why*.
- **Performance:** dashboard loads in under 2 s with 50 courses and 2,000 students of seed data
  (write a seed script to prove it).
- **Data integrity:** use database constraints (unique, foreign keys) for rules that must never break,
  and check what a delete *cascades* to: one click must never erase students' grades.
- **Graceful failure:** an unavailable optional service (email, AI) must not break the action that
  triggered it; an unexpected error shows a friendly page, not a crash.

---

## 6. Data model starter

A minimal relational model. You may design your own, but justify differences.

```
users(id, role, name, email*, student_id*, password_hash, must_change_password, active, ...)
sessions(id = sha256(token), user_id → users, expires_at, user_agent)
courses(id, code, term, title, credits, instructor_id → users, enrollment_key, published)   unique(code, term)
enrollments(course_id → courses, user_id → users)                                           pk(course_id, user_id)
sections(id, course_id → courses, position, title)
resources(id, course_id, section_id?, title, url? | file_id?)
assignments(id, course_id, section_id?, title, instructions, due_at, max_points, late_days)
submissions(id, assignment_id, student_id, text?, file_id?, submitted_at, grade?, feedback?)  unique(assignment_id, student_id)
quizzes(id, course_id, section_id?, title, time_limit, deadline, shuffle)
questions(id, quiz_id, position, prompt, options[], correct_index)
attempts(id, quiz_id, student_id, started_at, submitted_at?, score?, layout)                  unique(quiz_id, student_id)
answers(attempt_id, question_id, selected_index)                                             pk(attempt_id, question_id)
threads(id, course_id, author_id, title, body, is_announcement, pinned, locked)
posts(id, thread_id, author_id, body)
notifications(id, user_id, title, body, link, read_at)
audit_log(id, user_id?, action, detail, ip, created_at)
```

Questions to answer in your design report:
- Why is `enrollments` a separate table instead of a `course_ids` array on users?
- Which rules are enforced by constraints and which by application code, and why?
- What happens to grades when a student is removed from a course? When a section is deleted?

---

## 7. Suggested milestones

Follows a problem → design → prototype → test → evaluate → refine cycle.

| Week | Milestone | Evidence to submit |
|---|---|---|
| 1 | Problem discovery: interviews, existing-tool analysis, success metric | 2-page brief with user quotes and the metric |
| 2 | Design: data model, page map, security plan, tier choice | ER diagram, wireframes, threat list (S1–S12) |
| 3–4 | Core: auth, roles, courses, enrolment, materials | Demo + E2E tests for AUTH-01..04, CRS-01/03/08 |
| 5–6 | Core: assignments, quizzes, gradebook | Demo + tests for ASG/QZ/GRD Core rows |
| 7–8 | Standard features chosen in week 2 | Feature table updated with status |
| 9 | Advanced feature(s) | Short write-up of design trade-offs |
| 10 | Evaluation with real users against the week-1 metric | Results, including what didn't work |
| 11 | Refinement, security review, accessibility pass | Before/after evidence |
| 12 | Final demo & report | Report, repo, test results, `npm audit` output |

---

## 8. Assessment rubric

| Criterion | Weight | Excellent (A) | Adequate (C) | Insufficient (F) |
|---|---|---|---|---|
| Problem & evaluation | 15% | Real users interviewed; metric defined up front and measured; honest results | Users described; some evaluation | No users or metric |
| Core functionality | 25% | All Core criteria pass, with automated tests | Core works with minor gaps | Core flows broken |
| Security | 20% | S1–S12 verified with evidence; no client trust | Most server-side checks present | Client-side checks only / secrets exposed |
| Design & code quality | 15% | Clear architecture, constraints in DB, typed, linted, explained decisions | Reasonable structure | Hard to follow, duplicated logic |
| Standard/Advanced features | 15% | Chosen for the users' needs; done thoroughly | Several features, some shallow | None beyond Core |
| UX & accessibility | 10% | Responsive, accessible (UI-05), consistent | Works on desktop | Unusable on mobile / inaccessible |

---

## 9. Changelog

Add a row whenever a feature's status changes. Newest first.

| Date | Version | Change | Feature IDs |
|---|---|---|---|
| 2026-11-27 | 4.0 | Production hardening: audit, security fixes, database-enforced integrity, transactional quizzes and grading, grade history, production configuration checks, institutional redesign, CI (see docs/CHANGELOG.md) | ADM-12, UI-05, UI-10 |
| 2026-11-27 | 3.2 | Verified backup & restore scripts; accessibility scan in light/dark with all WCAG 2.1 A/AA violations fixed (contrast, accessible names, nested controls) | ADM-12, UI-05 |
| 2026-11-27 | 3.1 | Stability pass: edit assignments and quizzes, graded work protected from deletion, error and not-found pages, malformed URL IDs handled, AI hidden while not configured, expired-session cleanup, stability test suite | ASG-12..13, QZ-14, UI-10 |
| 2026-11-27 | 3.0 | University LMS: admin console, courses & enrolment, sections, assignments, gradebook, discussions, calendar, catalogue, profiles, command palette, redesigned UI | AUTH-05..11, ADM-01..09, CRS-01..10, ASG-01..08, GRD-01..05, COM-01..06, SCH-01..02, TOOL-05, UI-01..07 |
| 2026-11-26 | 2.0 | File uploads, Jitsi live classes, whiteboards, local AI tutor & quiz drafting, notifications, lockout, audit log, per-student shuffling | CRS-04, SCH-03, TOOL-01..04, QZ-06..10, AUTH-08..09, COM-04..05 |
| 2026-11-26 | 1.0 | Next.js rebuild of the MERN prototype: secure auth, server-graded quizzes | AUTH-01..04, QZ-01..05 |

---

## Appendix: where features live in eduWave (for instructors)

*Consider removing this appendix before sharing the guide with students, if you want them to
design independently first.*

| Area | Files |
|---|---|
| Schema & constraints | `src/db/schema.ts`, `drizzle/` |
| Auth, sessions, lockout | `src/lib/auth/*`, `src/app/actions/auth.ts`, `src/proxy.ts` |
| Course access rules | `src/lib/access.ts` |
| Admin | `src/app/actions/admin.ts`, `src/app/admin/*`, `src/lib/data/admin.ts` |
| Courses, sections, materials, enrolment | `src/app/actions/instructor.ts`, `src/lib/data/courses.ts`, `src/components/course/*` |
| Assignments & grading | `src/lib/data/assessments.ts`, `src/app/instructor/assignments/*`, `src/app/student/assignments/*` |
| Quizzes | `src/lib/quiz-engine.ts`, `src/components/client/quiz-*.tsx` |
| Gradebook & grade rules | `src/lib/grading.ts`, `src/lib/data/gradebook.ts` |
| Discussions | `src/app/actions/community.ts`, `src/lib/data/community.ts` |
| Calendar | `src/components/pages/calendar-page.tsx`, `src/lib/data/activity.ts` |
| Uploads | `src/lib/uploads.ts`, `src/app/files/[fileId]/route.ts` |
| Notifications | `src/lib/notify.ts`, `src/components/client/notification-bell.tsx` |
| AI | `src/lib/ai.ts`, `src/app/api/ai/chat/route.ts` |
| Security headers | `next.config.ts` |
| Error handling | `src/app/**/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`, `src/lib/route-ids.ts` |
| Backups | `scripts/backup.ts`, `scripts/restore.ts` |
| Tests | `tests/e2e.mjs`, `tests/stability.mjs`, `tests/smtp-catcher.mjs`, `tests/a11y.mjs` |
