# Security

This file explains eduWave's security model, what changed in the 2026-11-27 hardening, and which risks remain. Full findings with severities: `docs/PRODUCTION_AUDIT.md`. Each fix is proven by a test (`tests/security.mjs`, `tests/db-integrity.ts`, `tests/e2e.mjs`).

**No software is "100% secure".** This document lists what is defended, how it was verified, and what is not.

## Model

1. **Authentication**
   - Random 32-byte session token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production). The database stores only its SHA-256 hash.
   - Absolute 7-day expiry enforced on the server. Sessions can be revoked.
   - Passwords use bcrypt with cost 12 (see *Accepted risks*), a 10-character minimum and a deny-list.
2. **Authorization**
   - Every page, Server Action and route handler calls the Data Access Layer (`src/lib/auth/dal.ts`): `requireAdmin`, `requireInstructor`, `requireStudent`, `requireUser`, or `getActiveUser` for routes.
   - Course access rules live in `src/lib/access.ts`: instructors own their courses; students need an enrolment in a **published** course.
   - Access denials return **404**, so IDs can't be probed.
   - `src/proxy.ts` only redirects signed-out visitors early. It is not the security boundary.
3. **Data integrity:** the database enforces academic rules (`docs/DATABASE.md`).
4. **Configuration:**
   - Production refuses to start unless it is safe (`src/lib/env.ts`, `src/lib/startup-checks.ts`).
   - There must be PostgreSQL (no silent PGlite fallback), an https `APP_URL`, a complete SMTP configuration if any SMTP setting is given, and no published sample accounts.

## Vulnerabilities fixed (2026-11-27)

| ID | Severity | Issue | Fix | Proven by |
|---|---|---|---|---|
| SEC-01 | High | `moderateThread` wrote client-supplied fields into the database, so an instructor could move or rewrite any thread. | Strict Zod schema; only `pinned` and `locked` are written. | security.mjs (crafted Server Action call) |
| DB-01 | High | Abandoned quiz attempts were never scored, so the gradebook showed "missing / 0". | `finalizeExpiredAttempts` before every score read; real end time recorded. | stability.mjs |
| DB-02 | High | An answer could be saved after scoring, so the score disagreed with the answers. | Row locks in one transaction, plus a trigger that freezes answers. | db-integrity.ts (concurrent, PostgreSQL) |
| DB-03 | High | Editing a quiz while a student started it left the student with zero questions. | Quiz-row locks, plus a trigger that freezes questions. | db-integrity.ts |
| DB-04 | High | Grade changes left no history and no grader identity. | `grade_events` table, `graded_by` column, append-only trigger. | db-integrity.ts |
| SEC-02 | Medium | Unpublished courses leaked through the calendar, notifications, email and board lists. | Visibility filtered on `published` everywhere students look. | security.mjs |
| SEC-03 | Medium | A spoofed `X-Forwarded-For` bypassed per-IP limits and forged audit IPs. | `TRUSTED_PROXY_HOPS`; client-supplied entries are never trusted. | security.mjs |
| SEC-04 | Medium | Account lockout could be doubled (email and ID were separate keys). | One budget per real account (keyed on user id); an admin password reset also unlocks. | e2e.mjs (lockout) |
| SEC-05 | Medium | Production silently fell back to PGlite; no configuration validation. | `env.ts` validation plus refusal at startup. | Manual probes (below) |
| SEC-06 | Medium | The seed could create published credentials in production. | The seed refuses in production; startup refuses if sample accounts exist. | Manual probes (below) |
| DB-05 to DB-07 | Medium | Grading/resubmission races; files orphaned; delete could cascade into student work. | Transactions, optimistic concurrency, `ON DELETE RESTRICT`. | db-integrity.ts, stability.mjs |
| DB-08, DB-09 | Medium | Cross-course references and value ranges were enforced only in app code. | Composite FKs and CHECK constraints. | db-integrity.ts |
| SEC-07 | Low | A temporary (issued) password worked on APIs, downloads and shared pages. | `requireUser` and `getActiveUser` enforce the password change. | security.mjs |
| SEC-08 | Low | No session rotation after a password change; no limit on current-password guesses. | All sessions revoked and a new one issued; 5 tries per 15 minutes. | security.mjs |
| SEC-09 | Low | Student PDFs opened inline in the LMS origin. | Student uploads always download. | security.mjs |
| SEC-10 | Low | Any ZIP passed as `.docx`; WAV passed as WebP. | OOXML structure check; WEBP signature check. | security.mjs |
| SEC-11 | Low | AI chat body was unbounded; boards were uncapped. | 128 KB cap (413); 50 boards per user. | Code review |
| SEC-12 | Low | Failed-login identifiers were stored verbatim (a mistyped password could land in the log). | Unknown accounts are logged as "unknown account". | security.mjs |
| SEC-13 | Low | `deleteActivity` leaked other courses' submission counts. | Ownership checked before anything else. | security.mjs |

**Manual probes:** production `next start` was run with no `DATABASE_URL` (refused), with a database containing sample accounts (refused), and with a clean PostgreSQL database plus an https `APP_URL` (started, with HSTS).

## Re-verification (4.0.1)

Every item above was re-inspected in the code on 2026-11-27: Server Action authorization, course ownership, student isolation, file downloads, the temporary-password gate, session revocation and rotation, lockout, trusted proxies, AI request limits, thread moderation, CSV exports and production validation. The attack replays (`test:security`, 10/10) and E2E security checks (42/42) pass against the 4.0.1 build. Production startup refusals were re-tested with five configurations (`docs/TESTING.md`).

No new critical or high-severity issues were found. One high-severity **release** issue was fixed: CI typecheck failed on clean checkouts (CI-01 in `PRODUCTION_AUDIT.md`). It was not a security issue.

## Accepted risks (documented exceptions)

| Risk | Why accepted | Mitigation |
|---|---|---|
| CSP allows `'unsafe-inline'` scripts (SEC-14) | Next.js inlines bootstrap scripts; per-request nonces would disable static prerendering. | No HTML injection sink exists: Markdown renders to React elements, and the only `dangerouslySetInnerHTML` is a static theme script. Other CSP directives still block third-party scripts, framing, plugins and form hijacking. Revisit if raw HTML is ever rendered. |
| bcrypt (cost 12) rather than Argon2id | bcrypt is still acceptable under OWASP for existing systems; Argon2 needs a native module, which complicates zero-cost and lab deployments. | Cost 12, and the login throttle limits online guessing. bcrypt reads only the first 72 bytes of a password, which is still ample for a passphrase. **Upgrade path:** rehash with Argon2id when each user next signs in. |
| Targeted lockout of a known account (availability) | The alternative (no lockout) favours password guessing. | 15-minute locks; an admin password reset unlocks immediately; lockouts are audited. |
| Public meet.jit.si rooms (SEC-15) | Free and zero-setup. | 96-bit random room names, links shown only to enrolled students. **For production, self-host Jitsi with JWT auth** (`JITSI_DOMAIN`). |
| Admins act as managers in discussions and can download course files (SEC-16) | Oversight is a legitimate university function. | Every admin action is audited with `actor_id`. Grading is instructor-only. |
| Clock skew between app and database hosts | Single-host deployments have none. | Use NTP on both hosts. Locked transactions read DB `now()` for start and finish times. |

## Reporting a vulnerability

Please email the maintainers privately; don't open a public issue. Include steps to reproduce.
