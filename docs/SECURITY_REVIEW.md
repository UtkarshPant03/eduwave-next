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
| Cross-section / cross-department | **Not applicable yet** | Sections and departments don't exist. Tests must be added with Phase 2 |
| CSRF | Server Action Origin checks; SameSite=Lax | — |
| XSS | No raw-HTML sink; React elements only; CSP | `'unsafe-inline'` accepted (`SECURITY.md`) |
| SQL injection | Parameterised Drizzle queries; `sql.raw` only for static identifiers | Reviewed |
| Uploads / downloads | Validated and authorised | sec (fake OOXML, inline student PDFs, other students' files) |
| Rate limiting | Login, enrolment keys, posts, AI, password change | — |
| Sensitive data exposure | Errors carry only a digest; no secrets in the bundle | — |
| Logging / audit | Append-only audit log with actor and trusted IP; grade history | **Gap:** quiz score changes and attendance need history when added |
| Dependencies | `npm audit --omit=dev`: 0; CI enforces it | — |
| Backup security | Backups contain personal data; documented as private and off-site | Encryption at rest is the operator's responsibility (document per D5) |

## Academic data protection

| Data | Who changed / what / when / previous / new | Approval | Status |
|---|---|---|---|
| Assignment grades | `grade_events` (grader, old, new, time) + `submissions.graded_by` | None | **Covered** |
| Quiz scores | Computed once by the server; no override path, so nothing to track | — | Covered (when overrides arrive, history is required) |
| Attendance | — | — | **Required when built:** every mark and correction keeps history (who, old, new, reason). Corrections go through request → approve |
| Enrolment | Audit events (`enrolment_added/removed`) | — | Covered |
| User accounts | Audit events with actor | — | Covered |
| Activities with student work | Deletion refused (RESTRICT) | — | Covered |

## Security tests to add with each phase

| Phase | Tests |
|---|---|
| 2 (hierarchy and permissions) | Department admin can't manage another department; TA can't change grades unless granted; faculty limited to assigned courses or sections; role-assignment changes audited |
| 3 (attendance, question bank, gradebook) | Student can't mark their own attendance; instructor can't edit attendance outside their sections; correction history immutable; question bank isolated per course/department; grade overrides audited |
| 4 (live class, whiteboard) | Room tokens only for enrolled users; board collaboration only for permitted members |
| 5 (AI) | Retrieval never returns material from courses the user can't access (tested with two courses and two students) |
