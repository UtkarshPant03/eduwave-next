# Security review: institutional requirements

This reviews eduWave against the security requirements for a Graphic Era deployment. It does **not** repeat `SECURITY.md`, which covers the model, the fixed vulnerabilities and the accepted risks, or `PRODUCTION_AUDIT.md`, which covers finding history.

**Date:** 2026-11-27 · **Commit:** `ea1b9b3` · **Open critical/high findings:** none.

## Status by area

| Area | Status | Evidence / gap |
|---|---|---|
| Authentication | Strong for local accounts | bcrypt 12, lockout, generic errors, no enumeration (e2e, sec) |
| Session lifecycle | Good | Hashed tokens, absolute expiry, revocation, rotation on password change (sec). **Gap:** no idle timeout. Consider 2–8 h idle expiry for shared lab computers (policy D6) |
| Password storage | Acceptable | bcrypt; Argon2id upgrade path documented |
| Institutional SSO readiness | **Not ready** | No OIDC/SAML. The DAL design (one `getCurrentUser`) lets an OIDC login add a session without touching authorisation. Needs Graphic Era IdP details (D2) |
| Account recovery | **Gap** | Admin reset only. Self-service reset needs email tokens (Phase 6), or SSO makes it the IdP's job |
| Authorisation (roles) | Correct but **coarse** | Every action authorised server-side (sec, e2e). Three global roles, so scoped administration (department, section) is impossible today (A-01, Phase 2) |
| Role escalation / mass assignment | Tested | Admin actions require admin; moderation uses a strict schema (sec) |
| IDOR / cross-course | Tested | Ownership checks, 404s, UUID validation (sec, e2e) |
| Attendance boundaries | Tested (4.3) | A student's crafted `saveAttendance` call and a TA's crafted `decideCorrection` call are refused; students can request corrections only for their own marks; marks for students not enrolled in the course are refused by the database (`test:attendance`, `test:db`). **Not yet enforced:** limiting a marker to their own sections, because staff aren't assigned to sections (see roadmap) |
| Cross-section / cross-department | Tested (4.2) | A department admin's crafted calls against another department's course (unlink section, remove staff, enrol) are refused, and their department page returns 404. A TA can't change a course; a non-coordinator instructor outside the department can't change staff; instructors and students can't call administrator actions (`test:institution`, 21 checks) |
| Question bank and quiz keys | **Built, not yet tested by QA** (4.4) | Bank actions require `course.manage` on the course (TAs: view only, via `course.view`). Department sharing: `sharedBankSource` 404s unless the source course has the same non-null department; the copy action re-checks it. Answer keys of every type (correct options, accepted answers, numerical values and tolerances) are sent to students only after the deadline plus grace; during an attempt the runner gets prompts, options and the student's own responses only. `saveAnswer` accepts only questions the current open attempt was given (also a database trigger). Needs crafted-call and page-source tests (QA) |
| CSRF | Server Action Origin checks; SameSite=Lax | — |
| XSS | No raw-HTML sink; React elements only; CSP | `'unsafe-inline'` accepted (`SECURITY.md`) |
| SQL injection | Parameterised Drizzle queries; `sql.raw` only for static identifiers | Reviewed |
| Uploads / downloads | Validated and authorised | sec (fake OOXML, inline student PDFs, other students' files) |
| Rate limiting | Login, enrolment keys, posts, AI, password change | — |
| Sensitive data exposure | Errors carry only a digest; no secrets in the bundle | — |
| Logging / audit | Append-only audit log with actor and trusted IP; grade history; attendance history (4.3) | **Gap:** quiz score changes need history when overrides are added |
| Dependencies | `npm audit --omit=dev`: 0; CI enforces it | — |
| Backup security | Backups contain personal data; documented as private and off-site | Encryption at rest is the operator's responsibility (document per D5) |

## Academic data protection

| Data | Who changed / what / when / previous / new | Approval | Status |
|---|---|---|---|
| Assignment grades | `grade_events` (grader, old, new, time) + `submissions.graded_by` | None | **Covered** |
| Quiz scores | Computed once by the server per attempt; no override path, so nothing to track. With several attempts, the counted value is derived (grading method), never stored; changing the method after attempts exist changes the counted value without history | — | Covered (when overrides arrive, history is required) |
| Attendance | `attendance_events`, written by a database trigger on every mark and change (who, old, new, reason); append-only | Correction request → approval by `attendance.approve` (instructor or coordinator, not TA) | **Covered** (4.3) |
| Enrolment | Audit events (`enrolment_added/removed`) | — | Covered |
| User accounts | Audit events with actor | — | Covered |
| Activities with student work | Deletion refused (RESTRICT) | — | Covered |
| Bank questions copied between courses | Audit event `bank_questions_copied` (who, how many, from which course to which) | — | Covered (4.4) |

## Security tests to add with each phase

| Phase | Tests |
|---|---|
| 2 (hierarchy and permissions) | Department admin can't manage another department; TA can't change grades unless granted; faculty limited to assigned courses or sections; role-assignment changes audited |
| 3 (attendance, question bank, gradebook) | Student can't mark their own attendance; instructor can't edit attendance outside their sections; correction history immutable; question bank isolated per course/department; grade overrides audited |
| 4 (live class, whiteboard) | Room tokens only for enrolled users; board collaboration only for permitted members |
| 5 (AI) | Retrieval never returns material from courses the user can't access (tested with two courses and two students) |
