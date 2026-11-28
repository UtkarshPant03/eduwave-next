# Testing

All tests use free tools: Playwright driving an installed browser (Edge by default; `BROWSER_CHANNEL=chrome` for Chrome), axe-core, and a built-in fake SMTP server (`tests/smtp-catcher.mjs`). CI runs everything on each push (`.github/workflows/ci.yml`).

## Suites

| Command | What it proves | Checks |
|---|---|---|
| `npm run lint`, `npm run typecheck`, `npm run build` | Static correctness; the production build compiles | n/a |
| `npm run test:unit` | Pure logic: grade bands and rounding, totals, submission windows, quiz timing and grace, shuffling, upload validation (PDF, OOXML, WebP, text), download disposition, CSV formula escaping and filenames, course-staff capabilities, attendance arithmetic (policy passed in, never assumed); question types (answer checking per type, all-or-nothing multiple answer, short-answer normalisation, numerical tolerance), attempt scoring, grading methods, question validation, random-slot picks (`tests/unit/questions.test.ts`) | 43 |
| `npm run test:db` | Database-enforced integrity (cross-course and cross-quiz references, value ranges, grade limits, frozen answers and questions, completion-tick validity, append-only history, RESTRICT deletes, attendance enrolment check, history and one-open-request rule) plus **real concurrency** between answer saving and finalisation | 36 |
| `npm run test:e2e` | Full course lifecycle for all three roles, plus core security (headers, redirects, cross-user access, grading limits, deactivation, lockout) | 42 |
| `npm run test:stability` | Data safety: graded work can't be deleted, edit rules, the quiz timer auto-submits, abandoned attempts are closed, email delivery, malformed URLs | 15 |
| `npm run test:security` | Replays the audit's attacks, including **crafted Server Action calls**: mass assignment, information leaks, privilege escalation, hidden-course leaks, fake Office files, inline student PDFs, temp-password misuse, session rotation, log hygiene, spoofed `X-Forwarded-For` | 10 |
| `npm run test:institution` | Phase 2: admin builds department → programme → session/term → batch → section, places students, links a course and enrols its sections; adds a TA; the primary instructor can't be removed; department admin manages their own department; coordinator adds and removes staff; **crafted Server Action calls** by a TA, a department admin (other department), a non-coordinator instructor, and an instructor or student (admin actions) are refused | 21 |
| `npm run test:attendance` | Phase 3: no minimum assumed by default; seeded percentages; a section-limited sheet lists only that section; saving; a configured minimum flags students; the student's view and correction request; approval and notification; CSV export; **crafted Server Action calls** by a student (marking) and a TA (deciding a correction) are refused | 12 |
| `npm run test:a11y` | axe-core WCAG 2.1 A/AA scan of about 30 pages × 3 roles × light and dark theme, including the Attendance tab and the attendance sheet | 0 violations |

## Running locally

```bash
# Database tests: use a THROWAWAY database (they insert fixtures)
PGLITE_DIR=./.pglite-test npm run db:migrate && PGLITE_DIR=./.pglite-test npm run test:db
# or against PostgreSQL:  DATABASE_URL=postgres://… npm run test:db

# Browser suites: fresh sample data + a production build in "local" mode
rm -rf .pglite && npm run db:migrate && npm run db:seed
npm run build
EDUWAVE_ENV=local SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_USER=test SMTP_PASS=test npm start -- -p 3100
npm run test:e2e && npm run test:stability && npm run test:security && npm run test:institution && npm run test:attendance && npm run test:a11y   # second terminal
```

The suites run in that order against one database. Each creates its own users and courses with unique names, so they can be re-run.

## Results, 4.0.1 (2026-11-27, Windows 11, Node 22, Edge, plus GitHub Actions on Ubuntu with Chrome)

| Check | Result |
|---|---|
| Clean state: `npm ci`, lint, `typecheck` (typegen + tsc), build, `npm audit --omit=dev` | pass, no warnings, 0 vulnerabilities |
| test:db: fresh PGlite / PostgreSQL 18 upgrade (0001 → 0002) / fresh PostgreSQL 18 | 22/22 on each; migrating twice is a no-op |
| test:e2e / test:stability / test:security / test:a11y (fresh sample data) | 42/42, 15/15, 10/10, no violations |
| Production start refused: no config / sample accounts / http APP_URL / partial SMTP | refused with the specific reason each time |
| Production start, clean PostgreSQL + https APP_URL | started |
| PostgreSQL backup → restore into an empty database | identical counts; all 9 triggers and the migration history preserved |
| GitHub Actions | see the latest run on the repository's Actions tab (recorded in the release notes) |

### Previous results, 4.0.0

| Check | Result |
|---|---|
| `npm ci`, lint, typecheck, production build | pass (no warnings) |
| `npm audit --omit=dev` | 0 vulnerabilities |
| test:db on upgraded PGlite (old data + new migration) | 19/19 |
| test:db on upgraded PostgreSQL 18 | 19/19 (genuinely concurrent) |
| test:e2e / test:stability / test:security | 42/42, 15/15, 10/10 |
| test:a11y | no violations (light and dark) |
| Mobile overflow at 390 px (landing, login, dashboards, course page) | none |
| Production start: no DB / sample accounts / clean PostgreSQL | refused / refused / started with HSTS |
| Seed in production mode | refused |
| Backup and restore: PGlite; PostgreSQL (`pg_dump` → `pg_restore`) | counts identical; triggers preserved |

## Not covered by automated tests

- **Browsers:** Firefox and Safari. Only Chromium-based Edge is tested.
- **AI:** AI features against a real model. The AI tutor is off by default.
- **Whiteboards:** real-time multi-user collaboration.
- **Load:** performance at large scale. Thousands of users have not been load-tested.
- **Screen readers:** manual NVDA or VoiceOver runs. Automated checks catch only part of accessibility problems.
- **Docker:** the image and the CI workflow itself. Both run only on GitHub; locally the same commands were run individually.
