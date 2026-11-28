# Implementation roadmap

This plan is ordered by dependency and verified risk, not by feature count. Each phase ends with:
- lint, typecheck and build;
- every test suite, plus new tests for the phase;
- migrations verified on PGlite and PostgreSQL;
- updated docs.

Security fixes are never postponed to a later phase.

## Decisions needed from the university

These can't be inferred and must not be invented. Work proceeds behind **configurable boundaries** until they are answered.

| # | Decision | Blocks | Default until answered |
|---|---|---|---|
| D1 | Academic structure details: are sections per batch per semester? Can students change section between semesters? How are electives that span sections handled? | Phase 2 details | Generic model: a section belongs to a batch; section membership is recorded per term |
| D2 | Single sign-on: which identity provider (Google Workspace, Microsoft Entra ID, other), which protocol (OIDC or SAML), and which identifier claims (email, roll number, employee ID)? | SSO, account recovery | Local accounts; OIDC adapter designed but disabled |
| D3 | Attendance policy: threshold(s), whether "late" counts, the condonation process, and who approves corrections | Attendance reports and alerts | Threshold configurable per course or department. **No hard-coded value** |
| D4 | Grading policy: SGPA/CGPA calculation (credit-weighted?), grade boundaries, internal/external weightage | Gradebook categories, GPA | Current 10-point scale kept; weights configurable per course |
| D5 | Infrastructure: servers for the app, PostgreSQL, Jitsi, Ollama (GPU?), storage, backups, monitoring; who operates them | Phases 4–6 | Single-server documentation (`DEPLOYMENT.md`) |
| D6 | Session policy: idle timeout, shared lab computers | Session hardening | 7-day absolute expiry (unchanged) |
| D7 | Retention: audit and academic records; consent policy for recording live classes | Recording, retention jobs | Keep everything; no recording |
| D8 | ERP: does the university system expose students, courses and enrolments (API or CSV), and which system is the source of truth? | Bulk sync | CSV import with a documented format |

## Phase 0: stabilisation

| Item | Status |
|---|---|
| CI green, migrations verified, baseline re-run | **Done** (`REPOSITORY_AUDIT.md` §1) |
| Remove dead code (A-05); remove gradient swatches (A-06); fix AI prompts (A-07) | **Done**, 2026-11-27 |
| Unit tests for pure logic (A-04) | **Done**: `npm run test:unit` (21), in CI |

## Phase 2: institutional foundation (next)

**Proposed data model.** Every change is additive: new tables and nullable foreign keys, back-filled, with nothing dropped.

```
departments (id, code ▲, name, active)
programmes (id, department_id →, code, name, semesters)
academic_sessions (id, name e.g. "2026–27", starts_on, ends_on)
terms (id, session_id →, name e.g. "Odd semester", starts_on, ends_on)
batches (id, programme_id →, intake_year, name)
class_sections (id, batch_id →, name e.g. "A")
student_sections (student_id →, section_id →, term_id →)        -- membership can change per term
courses + department_id →, term_id →   (nullable; back-filled from the existing text)
course_sections (course_id →, section_id →)                       -- which sections take this offering
course_staff (course_id →, user_id →, role: coordinator | instructor | teaching_assistant, section_id → null)
role_assignments (user_id →, role: university_admin | department_admin | hod | dean, department_id → null)
```

**Authorisation.** A capability map in code, e.g. `course.manage`, `grade.edit`, `attendance.mark`, `department.manage`. It is resolved by one function, `can(user, capability, scope)`, used by every action. `users.role` stays as the user's persona for routing, so existing behaviour is unchanged while the scoped checks are added.

**Migration and rollback.**
1. Create the new tables.
2. Create departments from the distinct `courses.department` values.
3. Copy `courses.instructor_id` into `course_staff` as `instructor`.
4. Keep all existing columns.

Rollback drops only the new tables and columns. The original data is untouched.

**Work items** (each with tests): structure admin pages; offering creation per term; enrolment of whole sections; course staff management, so several faculty and TAs can share a course; department-scoped admin console; cross-department and cross-section security tests.

## Phase 3: core academic LMS

Ordered by value to Graphic Era:

| Priority | Item | Depends on |
|---|---|---|
| P1 | **Attendance**: sessions per course and section; present, absent, late or excused; bulk marking; student history; percentages; correction requests with approval and history; configurable thresholds (D3) | Phase 2 sections |
| P1 | **Question bank and question types**: bank per course (sharable within a department), categories and tags; multi-answer multiple choice, true/false, short answer, numerical; random from category; open date; multiple attempts with grading method | — |
| P1 | **Gradebook categories and weights** (e.g. internal / mid-semester / end-semester); scale as data; overrides with history; hidden grades and release | D4 for defaults |
| P1 | **Assignments**: multiple files, submission history (versions), feedback files, bulk download | — |
| P2 | Completion conditions and restrict access (date, completion, grade); course completion | — |
| P2 | Groups (and group assignments); rubrics and marking guides; marking workflow and release | Phase 2 |
| P2 | Resources: page, folder, label; quiz review options; overrides (extra time); participation and activity reports | — |

## Phase 4: integrated learning environment

| Item | Notes |
|---|---|
| Self-hosted Jitsi with JWT | Only enrolled users or staff get tokens; moderator equals course staff; lobby on |
| Live-class attendance | From server-side participant events, not trusted client data |
| Real-time whiteboard collaboration | Self-hosted relay; evaluate Excalidraw's room server vs Yjs. Course-linked boards; save to course resources |
| Session history; whiteboard inside the class | — |

**Jitsi stays.** A replacement such as BigBlueButton would need a written comparison first (recording, moderation, operating cost).

## Phase 5: AI (local first)

| Item | Notes |
|---|---|
| Course-aware assistant | Retrieval over **authorised** course resources only. pgvector on PostgreSQL, Ollama embeddings. Access is checked per chunk against the user's courses |
| Other tools | Summaries, faculty assistant, question drafts. AI output is always labelled and staff review is required before it enters a course |
| Optional external API adapters | Off by default |

## Phase 6: institutional readiness

- **Load tests** with k6 (free): exams under concurrency, dashboards.
- **Monitoring and health:** a health endpoint and structured logs shipped to a self-hosted stack.
- **Packaging:** a Dockerfile, built and tested in CI.
- **Accounts:** account recovery or SSO (D2), and an idle session timeout (D6).
- **Operations:** runbooks for backup, restore and incidents.

## Implementation tracker

| Feature | Priority | Depends on | Status | Files changed | Tests | Verification | Limitations |
|---|---|---|---|---|---|---|---|
| CI typecheck fix | P0 | — | Done (4.0.1) | package.json, ci.yml | CI | Green, run 45961940139 | — |
| Completion integrity | P0 | — | Done (4.0.1) | 0002 migration | test:db (+3) | PGlite + PostgreSQL 18 | Pre-existing orphans kept (cleanup SQL documented) |
| Phase 0 cleanup (A-05/06/07) | P0 | — | Done | activity.ts, charts.tsx, course page, ai.ts | lint, typecheck, build, e2e/stab/sec/a11y | 42/42, 15/15, 10/10, 0 violations | AI prompt change not exercised against a model |
| Unit tests (A-04) | P0 | — | Done | tests/unit/logic.test.ts, package.json, ci.yml | test:unit (21) | 21/21 local | Not yet run in CI (runs on next push) |
| Academic hierarchy (Phase 2a) | P1 | D1 (details) | **Done** | 0003 migration, schema.ts, data/institution.ts, actions/institution.ts, /admin/structure | test:db (+7), test:institution (14) | PGlite + PostgreSQL 18 (upgrade back-fill + fresh) | Create-only: no rename, deactivate or CSV upload yet |
| Course staff + capability permissions (Phase 2a) | P1 | hierarchy | **Done** | capabilities.ts, access.ts, instructor actions, course page, /admin/courses/[id] | test:unit (+3), test:institution (TA crafted calls) | All suites green | Staff managed by admins only (not yet by coordinators) |
| Enrol whole class sections (Phase 2a) | P1 | hierarchy | **Done** | enrolLinkedSections | test:institution | Placed students enrolled exactly | Admin only; no automatic sync when placements change |
| Department-scoped administration (Phase 2b) | P1 | D1 | **Done** (4.2) | auth/scope.ts, actions/institution.ts, components/institution/*, /instructor/department/* | test:institution (+7), test:unit (+1), test:db (+1) | All suites green on fresh data | Deans are department-scoped like HODs (no faculty/school level yet; D1). No CSV upload for structure or placements |
| Structure editing (Phase 2b) | P2 | — | **Done** (4.2) | updateDepartment/Programme/Term, rename batch/section | test:institution (indirect) | — | No delete; deactivate departments and programmes only |
| Staff management by coordinators (Phase 2b) | P2 | — | **Done** (4.2) | capabilities.ts (staff.manage), course page | test:institution, test:unit | — | — |
| Attendance (Phase 3) | P1 | hierarchy, D3 | **Done** (4.3) | 0004 migration, schema.ts, lib/attendance.ts, data/attendance.ts, actions/attendance.ts, components (attendance, attendance-panel), session page, CSV export, capabilities.ts | test:attendance (12), test:unit (+4), test:db (+6), a11y | All suites green on fresh data; 0004 verified on PGlite and PostgreSQL 18 (upgrade + fresh) | Minimum is per course only (no department default yet; D3). No condonation workflow or automatic alerts. Any staff with `attendance.mark` on the course can mark any of its sessions (staff aren't assigned to sections yet). Sessions can't be edited or deleted in the interface. Live-class attendance is Phase 4 |
| Question bank + types + attempts | P1 | — | **Built, in QA** (4.4.0) | 0005 migration, schema.ts, lib/questions.ts, quiz-engine.ts, data/question-bank.ts, data/assessments.ts, data/gradebook.ts, actions/question-bank.ts, actions/instructor.ts, actions/student.ts, quiz builder/runner, question-fields, question-bank components, /instructor/courses/[id]/bank (+ shared/[sourceId]), quiz pages and CSV, seed | test:unit (+14 → 43); no new browser suite yet | Dev: typecheck, lint, build, unit, migrate + seed from scratch, test:db 36/36, e2e 42/42, stability 15/15; 0005 upgrade of a 0004 database with a scored attempt verified on PGlite only | Not verified on PostgreSQL yet. Snapshot model: bank edits reach a quiz only if it is re-saved before anyone starts. Random picks avoid repeats across students but are not guaranteed unique. Average grading stores 2 decimals. No import/export (GIFT, Moodle XML), essay/manual grading, partial credit, or question versioning (out of scope) |
| Assignments: files, versions, feedback files, bulk download | P1 | — | **Built, in QA** (4.5.0) | 0006 migration, schema.ts, lib/uploads.ts (checkUploads), lib/zip.ts, data/assessments.ts, data/shared.ts (file access), actions/student.ts (submitAssignment), actions/instructor.ts (max files, add/remove feedback files), /instructor/assignments/[id]/download, submission-form, submission-files, assignment builder, both assignment pages, seed | test:unit (+12 → 53); no new browser suite yet | Dev: typecheck, lint, build, unit, migrate + seed from scratch, e2e 42/42, security 10/10; 0006 upgrade of a 0005 database verified on PGlite only | Not verified on PostgreSQL yet. Reopening a graded submission not built (optional in the spec). All files of one upload share 8 MB (9 MB request limit). ZIP is store-only, no ZIP64. Feedback files not versioned |
| Gradebook categories, weights, scale, overrides, release | P1 | D4 | **Built, in QA** (4.6.0) | 0007 migration, schema.ts, lib/grading.ts, data/gradebook.ts, data/assessments.ts, data/shared.ts, actions/gradebook.ts (new), actions/instructor.ts, gradebook table, CSV export, /instructor/courses/[id]/gradebook/setup and /overrides, gradebook-setup components, assignment and quiz builders, student course/grades/assignment/quiz pages, seed | test:unit (+15 → 68); no new browser suite yet | Dev: typecheck, lint, build, unit, migrate + seed from scratch (PGlite), a manual browser smoke of the new pages | Not verified as an upgrade of a seeded 0006 database, nor on PostgreSQL. Before/after comparison on seeded data is a unit-level equivalence test only (QA to compare real gradebooks). Defaults reproduce the old gradebook; no university scheme assumed (D4 open). Release and categories are per item, set on the setup page (release needs `course.manage`). No SGPA/CGPA across courses, letter-only or extra-credit items (out of scope) |
