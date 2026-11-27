# Feature inventory

Verified on 2026-11-27 against commit `ea1b9b3` by reading the code, the schema and the tests. Nothing was taken from documentation alone.

**Status key:**

| Status | Meaning |
|---|---|
| **Verified** | Fully implemented and covered by automated tests |
| **Implemented** | Implemented, but insufficiently tested |
| **Partial** | Partially implemented |
| **UI only** | Interface exists, backend incomplete |
| **Broken** | Exists but doesn't work |
| **Missing** | Not built |

Roles: **A** admin · **I** instructor · **S** student. "Tests" names the suite that exercises the feature: e2e, stab(ility), sec(urity), db(-integrity) or a11y.

## Identity and access

| Feature | Roles | Code | Data | Tests | Status | Issues / action |
|---|---|---|---|---|---|---|
| Sign-in with email or student ID; generic errors | all | `actions/auth.ts` `login`, `/login` | users, sessions | e2e | **Verified** | — |
| Sessions (hashed token, 7-day expiry, revocation, rotation on password change) | all | `lib/auth/session.ts` | sessions | e2e, sec | **Verified** | No idle timeout (absolute only) |
| Lockout and rate limits | all | `lib/auth/throttle.ts` | login_throttle | e2e | **Verified** | Targeted lockout is an accepted risk |
| Forced change of issued passwords | all | `dal.ts` `requireUser` | users.must_change_password | sec | **Verified** | — |
| Self-service password reset | — | — | — | — | **Missing** | Admin reset only. Needs reset tokens by email (Phase 6) |
| Institutional SSO (OIDC/SAML) | — | — | — | — | **Missing** | Graphic Era IdP details unknown (decision D2) |
| Roles: admin / instructor / student personas + course-staff capabilities | all | `users.role`, `dal.ts`, `capabilities.ts` | users, course_staff | e2e, sec, institution | **Verified** | Course-level roles are done; department-level roles (HOD, department admin) are Phase 2b |
| Profile, sessions list, sign out other devices | all | account page | users, sessions | — | **Implemented** | — |
| Audit log (append-only, actor, trusted IP, filter, pagination) | A | `lib/audit.ts`, `/admin/audit` | audit_log | e2e, sec, db | **Verified** | — |

## Institution and administration

| Feature | Roles | Code | Data | Tests | Status | Issues / action |
|---|---|---|---|---|---|---|
| User create, CSV import, reset, deactivate | A | `actions/admin.ts`, `/admin/users` | users | e2e | **Verified** (import: **Implemented**) | No Excel import. Import is CSV only and not covered by tests |
| User list: search, role filter, pagination | A | `/admin/users` | users | e2e | **Verified** | — |
| Course create (code, term, credits, department, instructor, weeks) | A | `createCourse` | courses, sections | e2e | **Verified** | Department and term are free text. No academic hierarchy |
| Publish / hide course | A, I | `setCoursePublished`, settings | courses.published | sec | **Verified** | An instructor can override an admin's hide (accepted risk SEC-16) |
| Departments, programmes, sessions, terms, batches, class sections; per-term section placement | A | `/admin/structure`, `actions/institution.ts` | institution tables (0003) | db, institution | **Verified** (4.1) | Create-only; no rename, deactivate or bulk CSV upload |
| Course staff: coordinator, instructor, TA; capability-based permissions | A, I | `capabilities.ts`, `access.ts`, `/admin/courses/[id]` | course_staff | unit, institution, sec | **Verified** (4.1) | Staff managed by admins only |
| Course offering linked to department and term; enrol whole linked sections | A | `/admin/courses/[id]`, `enrolLinkedSections` | courses.department_id/term_id, course_sections | institution | **Verified** (4.1) | No automatic re-sync when placements change |
| Department-scoped administration | — | `role_assignments` (table only) | role_assignments | — | **Partial** | Phase 2b: UI and permission checks |
| Admin course detail (academic links, staff, sections) | A | `/admin/courses/[id]` | — | institution, a11y | **Verified** (4.1) | Title, code and credits are still edited by staff on the course settings page |
| Reports (participation, activity, grades) | — | — | — | — | **Missing** | Only per-course gradebook CSV and quiz CSV |
| Backup / restore (database level) | A (ops) | `scripts/backup.ts`, `restore.ts` | all | manual (PGlite and PostgreSQL) | **Verified** (manually) | No per-course backup or duplication |

## Courses and content

| Feature | Roles | Code | Data | Tests | Status | Issues / action |
|---|---|---|---|---|---|---|
| Weekly sections: add, rename, reorder, delete | I | `actions/instructor.ts` | sections | e2e | **Verified** | Position race fixed in 4.0.1 |
| Resources: web link, file (8 MB, allow-list, magic bytes, OOXML check) | I, S | `addResource`, `/files/[id]` | resources, files | e2e, sec | **Verified** | Single file. No folder, page, book, label or embedded video |
| Catalogue and self-enrolment with key | S | `/student/catalog`, `enrolWithKey` | enrollments | e2e | **Verified** | Catalogue not paginated |
| Enrol and unenrol by ID/email list | I | `enrolStudents` | enrollments | e2e (indirect) | **Implemented** | No enrolment of a whole section or batch (needs Phase 2) |
| Completion: manual ticks; automatic on submission | S | `setCompletion`, `doneCount` | completions | e2e, db | **Verified** | No completion conditions, restrictions or prerequisites |
| Course progress indicators | S | dashboards, course hero | — | e2e | **Verified** | — |
| Course categories, formats, duplication, import | — | — | — | — | **Missing** | Optional |

## Assignments

| Feature | Roles | Code | Data | Tests | Status | Issues / action |
|---|---|---|---|---|---|---|
| Create and edit; Markdown instructions; due date; late window; max points | I | `create/updateAssignment` | assignments | e2e, stab | **Verified** | No separate cut-off date (late window acts as one) |
| Submit text and/or one file; resubmit until graded | S | `submitAssignment` | submissions, files | e2e, sec | **Verified** | One file only. Resubmission overwrites, so no submission history |
| Grading with feedback text; max enforced; concurrency-safe; history | I | `gradeSubmission` | submissions, grade_events | e2e, stab, db | **Verified** | No rubric, marking guide, feedback files, grade release, anonymous marking, group assignments or bulk download |
| Graded work protected from deletion | I | `deleteActivity`, RESTRICT | — | stab, db | **Verified** | — |

## Quizzes and examinations

| Feature | Roles | Code | Data | Tests | Status | Issues / action |
|---|---|---|---|---|---|---|
| Builder: single-answer multiple choice (2–6 options), explanations, reorder, duplicate | I | `quiz-builder.tsx`, `createQuiz` | quizzes, questions | e2e | **Verified** | **Multiple choice only.** No multi-answer, true/false, short answer, numerical, essay or matching |
| Server timer, deadline, auto-submit, abandoned-attempt scoring | S | `quiz-engine.ts` | attempts | stab, db | **Verified** | No open date (available from creation). No grace or "must submit" policy choice |
| One attempt per student (DB unique) | S | — | attempts unique | db | **Verified** | **No multiple attempts** or grading method |
| Per-student question and option shuffling | S | `buildLayout` | attempts.layout | e2e | **Verified** | — |
| Answer-key protection (until deadline plus grace) | S | `getStudentQuiz` | — | e2e | **Verified** | Review policy is fixed, not configurable |
| Transactional answers and finalisation; frozen questions | S, I | locks + triggers | — | db (concurrent) | **Verified** | — |
| Analytics (distribution, per-question picks) and CSV export | I | `/instructor/quizzes/[id]` | — | e2e (export) | **Verified** | — |
| Question bank, categories, tags, random selection | — | — | questions belong to one quiz | — | **Missing** | Phase 3 |
| Manual grading, negative marking | — | — | — | — | **Missing** | Phase 3 |
| AI-drafted questions (Ollama) | I | `aiDraftQuestions` | — | — | **Implemented**, off by default | Prompt said "school students" (fixed in Phase 0). Not re-tested against a model |

## Gradebook

| Feature | Roles | Code | Data | Tests | Status | Issues / action |
|---|---|---|---|---|---|---|
| Course gradebook (students × items), totals, 10-point letter scale | I, S | `lib/data/gradebook.ts` | — | e2e | **Verified** | Points summed: no categories, weights or aggregation choice. Scale is in code |
| Student grades page with GPA | S | `/student/grades` | — | e2e | **Verified** | "GPA" is provisional. Credit-weighted? Policy to confirm (D4) |
| CSV export with formula escaping | I | export route | — | e2e, sec | **Verified** | — |
| Grade history (assignments) | I | grade_events | — | db | **Verified** | Quiz scores have no override path, so no history needed yet |
| Overrides, hidden grades, release policies | — | — | — | — | **Missing** | Phase 3 |

## Attendance

| Feature | Status | Notes |
|---|---|---|
| Sessions, statuses (present, absent, late, excused), reports, corrections, policies | **Missing** | No code or tables. High priority for Graphic Era (Phase 3). The threshold must be configurable, not hard-coded (D3) |

## Communication

| Feature | Roles | Code | Data | Tests | Status | Issues / action |
|---|---|---|---|---|---|---|
| Course discussions: threads, replies, pin and lock (strict schema), delete | all | `actions/community.ts` | threads, posts | e2e, sec | **Verified** | Not paginated. No groups |
| Announcements (instructor) with notification and email | I | `createThread` | threads | e2e, stab | **Verified** | — |
| In-app notifications (summary polling) and optional SMTP email | all | `lib/notify.ts`, bell | notifications | e2e, stab | **Verified** | No full notifications page; no retention |
| Calendar of deadlines and live classes; phone agenda | all | `calendar-page.tsx` | derived | e2e | **Verified** | No custom or personal events; no iCal export |
| Direct messaging, polls, feedback surveys, peer assessment | — | — | — | — | **Missing** | Phase 3/4, as needed |

## Live classroom, whiteboard, AI

| Feature | Roles | Code | Data | Tests | Status | Issues / action |
|---|---|---|---|---|---|---|
| Schedule a live class (title, start, duration, section) | I | `scheduleLive` | live_sessions | — | **Implemented** | Not covered by e2e |
| Join a Jitsi room (random 96-bit name, opens 15 min early, enrolled students only) | I, S | `lib/live.ts`, course page | — | — | **Implemented** | Public meet.jit.si by default; no authentication or moderation; window enforced in the UI only; **no attendance capture** |
| Personal whiteboards: autosave, rename, delete, 2 MB scene cap, 50 per user | I, S | `actions/boards.ts`, Excalidraw | boards | — | **Implemented** | **No real-time collaboration.** Not covered by e2e |
| Share a board read-only with a course | I | `shareBoard` | boards.shared_course_id | sec (indirect) | **Implemented** | — |
| AI tutor (general chat, streamed, rate-limited, 128 KB cap) | S | `/api/ai/chat`, `lib/ai.ts` | — | — (disabled path only) | **Implemented**, off by default | Not course-aware (no retrieval). Hidden unless `OLLAMA_URL` is set at build |

## Interface and platform

| Feature | Status | Notes |
|---|---|---|
| Design system: tokens, primitives, WCAG AA in light and dark | **Verified** (a11y) | Some one-off page classes; the settings colour swatches still use a gradient (fixed in Phase 0) |
| Responsive layouts; phone calendar | **Verified** (no overflow at 390 px on sampled pages) | Tablet not explicitly checked |
| Loading, error and not-found states per role | **Verified** | — |
| Command palette, theme toggle, study timer, to-do list | **Implemented** | — |
| Production configuration validation and startup refusal | **Verified** (5 probes) | — |
| CI (lint, typecheck, build, audit, PostgreSQL integrity, browser suites) | **Verified** (green on `ea1b9b3`) | — |
| Unit tests for pure logic (grading, quiz layout, CSV, env) | **Missing** | Logic is covered only indirectly by e2e (Phase 0/2) |
