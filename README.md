# eduWave LMS

An open-source **learning management system for universities**, in the spirit of Moodle: courses
organised into weekly sections, assignments with grading and feedback, server-timed quizzes, a
gradebook, discussions and announcements, a calendar, live classes, whiteboards and a private AI tutor,
for **students**, **instructors** and **administrators**.

**Everything is free and open-source.** No paid APIs, no API keys in the browser, nothing that needs a
credit card. Optional extras (AI, email, hosted database) use free options.

📋 **[docs/FEATURES.md](docs/FEATURES.md)**: the full feature catalogue (with IDs, tiers and acceptance
criteria), security requirements, milestones and an assessment rubric. Use it as the requirements
guide when students build a similar system.

---

## Quick start

Requires Node.js 20+. No database install is needed: without `DATABASE_URL`, eduWave uses
[PGlite](https://pglite.dev), a real PostgreSQL compiled to WebAssembly, stored in `./.pglite`.

```bash
npm install                 # also copies the whiteboard fonts into public/
cp .env.example .env.local  # all settings are optional
npm run db:migrate
npm run db:seed             # sample university data (skip for a clean install)
npm run dev                 # http://localhost:3000
```

### Sample accounts (from `db:seed`)

All sample accounts use the password **`eduwave2026`**.

| Role | Sign in with | Notes |
|---|---|---|
| Administrator | `admin@eduwave.edu` | Users, courses, audit log |
| Instructor | `meera.iyer@eduwave.edu` | Teaches CS201 and CS204 (has a grading queue) |
| Instructor | `rahul.verma@eduwave.edu` | Teaches MA202 |
| Instructor | `sara.thomas@eduwave.edu` | Teaches HS101 |
| Student | `24CS1001` … `24CS1012` | Student ID or email; enrolled in 3–4 courses |

The seed creates one term ("Autumn 2026") with 4 courses, weekly sections, real public learning
links, graded and pending assignments, a closed quiz with results, an open quiz, live classes,
announcements and discussions, so every screen has realistic data.

### Clean installation (no sample data)

```bash
npm run db:migrate
npm run create-admin -- it.office@university.edu "Office of Academic IT"
```

This prints a one-time temporary password. Sign in, choose your own password, then create instructors,
courses and students from the admin console (individually or by CSV import).

> PGlite lets one process open `.pglite/` at a time. Stop the app before `db:migrate`, `db:seed` or
> `create-admin`. To reset everything: delete `.pglite/` and run them again.

---

## What each role can do

**Administrators**: provision users (single or CSV, temp passwords shown once), reset passwords,
deactivate accounts instantly, create courses and assign instructors, publish/hide courses, review the
site-wide audit log.

**Instructors**: build courses week by week (sections, files, links, live classes); create and edit
assignments (Markdown, late windows) and quizzes (shuffled, AI-drafted optionally); grade submissions
with feedback from one queue; see quiz analytics and a full gradebook with CSV export; post
announcements and moderate discussions; manage enrolment (by ID/email or an enrolment key).

**Students**: see every course and deadline on one dashboard; browse the catalogue and self-enrol
with a key; work through sections with completion tracking; submit assignments (text + file); take
timed quizzes; follow grades, a provisional GPA and feedback; discuss with classmates; use the calendar,
study timer, to-do list, whiteboards and the AI tutor.

**Everyone**: notifications, Ctrl+K command palette, light/dark theme, mobile layout, profile, active
sessions and sign-in history.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions) | One codebase; data access and secrets stay on the server |
| Language | TypeScript (strict) | Catches whole classes of bugs before runtime |
| Database | PostgreSQL via Drizzle ORM (PGlite locally) | Relational data, real constraints, typed queries |
| Validation | Zod | Every Server Action validates its input |
| UI | Tailwind CSS 4, lucide icons, Recharts | Plain, readable styling; accessible charts |
| Video | Jitsi Meet | Free and open-source; self-hostable |
| Whiteboard | Excalidraw (MIT) | Assets self-hosted; works offline |
| AI | Ollama (optional) | Open models on your own server; no student data leaves campus |

---

## Optional free services

| Feature | How to enable |
|---|---|
| AI tutor + AI quiz drafting | Install [Ollama](https://ollama.com), `ollama pull llama3.2`, set `OLLAMA_URL=http://localhost:11434` **before `npm run build`** (the navigation is prerendered), 8 GB+ RAM recommended |
| Email notifications | Any SMTP account in `.env.local`, e.g. a Gmail **App Password** |
| Hosted database | Set `DATABASE_URL` (Neon/Supabase free tier), then `npm run db:migrate` |
| Self-hosted video | Run Jitsi on campus and set `JITSI_DOMAIN` |

Without them everything else works: AI features are hidden entirely, and notifications stay in-app.

**Notes:** on meet.jit.si the first person in a room signs in to become moderator, so instructors
should start the class first. Small local AI models make mistakes, so AI-drafted questions are drafts
for review. Files are stored in Postgres, which is fine for course materials and submissions; move
large media to object storage if needed.

---

## Backups

Back up before every term starts, before upgrades, and on a schedule (e.g. nightly).

```bash
npm run db:backup                                   # → backups/eduwave-<UTC time>.tar.gz (verified)
npm run db:restore -- backups/eduwave-<…>.tar.gz    # old data is moved aside, not deleted
```

- **PGlite** (the default): stop the app first, as with `db:migrate`. Each backup is opened and read
  back before the script reports success. The newest 14 are kept (`BACKUP_KEEP` to change).
- **Postgres** (`DATABASE_URL`): uses `pg_dump`/`pg_restore` from the free PostgreSQL client tools;
  the app can stay online. Restoring needs `--yes` because it overwrites live data. *This path is
  written but not yet tested, because the test machine has no PostgreSQL tools.*
- **Schedule it:** Windows Task Scheduler or `cron` running `npm run db:backup` in this folder. The
  script exits with code 1 on any failure (including stopping early), so the scheduler can alert you.
- **Keep a copy elsewhere.** A backup on the same disk is lost with the disk. Backups contain student
  data and password hashes: keep them private. `backups/` is in `.gitignore`.
- **Test a restore** each term on a spare machine. A backup you've never restored is a hope, not a plan.

## Security model

1. `src/proxy.ts` redirects signed-out visitors to `/login?next=…` (a fast check only).
2. Every page, Server Action and route handler goes through the **Data Access Layer**
   (`src/lib/auth/dal.ts`) and the **course access rules** (`src/lib/access.ts`). These are the real
   security boundary: instructors only manage their own courses, students only see courses they're
   enrolled in, and anything else returns **404** so IDs can't be probed.

| Threat | Protection |
|---|---|
| Session theft | httpOnly SameSite cookie; DB stores only SHA-256 of the token; sessions revocable |
| Password guessing | DB-backed lockout (5 per account / 30 per IP per 15 min); generic errors; dummy hashing |
| Weak or shared passwords | ≥ 10 chars + deny-list; issued passwords must be changed; password change revokes other sessions |
| Departed users | Deactivation takes effect immediately, even for signed-in sessions |
| Cheating | Server timer and grading; one attempt (DB constraint); answer key hidden until the deadline; per-student shuffling |
| Reading others' work | Submission files readable only by their author and the course instructor |
| Malicious uploads | Extension allow-list + magic-byte check; 8 MB cap; `nosniff`; access-controlled downloads |
| XSS | React escaping; Markdown rendered to elements without `innerHTML`; strict CSP |
| Open redirect | `?next=` accepted only for the user's own area |
| CSV injection | Exports neutralise spreadsheet formulas |
| Spam / abuse | Rate limits on enrolment keys, posts, replies and AI |
| Auditability | Security events logged with IP; admins see a site-wide log |
| Accidental data loss | Assignments/quizzes with student work can't be deleted (server rule); edits can't invalidate existing grades |
| Information leaks on errors | Error pages show only a reference code; malformed URL IDs give "not found", never a database error |

`npm audit --omit=dev` reports 0 vulnerabilities (vulnerable sub-dependencies of the whiteboard are
pinned to patched versions via `overrides`). The full audit lists an old `esbuild` inside `drizzle-kit`,
a dev-only CLI; the advisory concerns esbuild's dev web server, which drizzle-kit doesn't run.

The CSP allows `'unsafe-inline'` scripts because Next.js inlines bootstrap scripts; removing it needs
per-request nonces, which disables static prerendering. That trade-off is worth discussing in class.

---

## Project layout

```
src/
  db/schema.ts            tables, keys, constraints, indexes (start reading here)
  lib/auth/               sessions, passwords, lockout/rate limits, Data Access Layer
  lib/access.ts           who may see / manage which course
  lib/data/*.ts           read queries by domain (courses, assessments, gradebook, community, …)
  lib/grading.ts          grade scale, late windows, totals policy (pure functions)
  lib/quiz-engine.ts      quiz timer, shuffling, grading
  app/actions/*.ts        Server Actions (all writes): validate → authorise → mutate → notify
  app/admin|instructor|student/…   role areas (each page has a loading skeleton)
  components/             UI primitives, course components, client components
scripts/                  migrate, seed, create-admin, backup, restore
tests/                    e2e.mjs (main flows), stability.mjs (data safety, timer, email)
docs/FEATURES.md          feature catalogue & project guide
```

## Scripts

| Script | Purpose |
|---|---|
| `dev` / `build` / `start` | Next.js |
| `lint`, `typecheck` | ESLint, `tsc --noEmit` |
| `db:generate` | After editing `src/db/schema.ts`, generate a SQL migration |
| `db:migrate`, `db:seed` | Apply migrations, load sample data |
| `create-admin` | Create the first administrator on a clean install |
| `test:e2e`, `test:stability`, `test:a11y` | Browser tests: main flows; data safety, timer and email; accessibility |
| `db:backup`, `db:restore` | Verified database backup with rotation; restore that keeps the old data aside |

## Troubleshooting

- **A CSS change doesn't appear after `npm run build`:** delete the `.next` folder and build again. We
  saw the build cache reuse an old `globals.css` once.
- **`db:migrate`/`db:seed` hangs or fails with PGlite:** another process (usually the app) has
  `.pglite/` open. Stop it first.

## Testing

```bash
rm -rf .pglite && npm run db:migrate && npm run db:seed
npm run build
# leave OLLAMA_URL unset; the SMTP settings point at the test's fake mail server
SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_USER=test SMTP_PASS=test npm start -- -p 3100
npm run test:e2e          # second terminal, ~1 min
npm run test:stability    # ~2 min (waits for a real 1-minute quiz timer)
npm run test:a11y         # ~2 min, accessibility scan of ~30 pages × light/dark
```

**42 checks** across all three roles: security headers and redirects; admin creates a student and a
course; instructor sets an enrolment key, adds material, publishes an assignment, a quiz and an
announcement; student forced password change, password policy, wrong/right enrolment key, completion
progress, file submission, quiz with answer-key protection and server grading, discussion reply,
calendar; cross-user security (exports, other students' files, non-enrolled courses, other instructors'
courses); grading with a server-enforced maximum, CSV export, grade notification; instant deactivation;
account lockout. Uses the installed Edge (`BROWSER_CHANNEL=chrome` for Chrome).

**15 stability checks:** malformed URL IDs give a not-found page; AI hidden while not configured;
graded work can't be deleted; editing can't push the maximum below an awarded grade; deadline
extensions round-trip exactly and notify students in-app and by email (BCC, plain text, captured by
`tests/smtp-catcher.mjs`, so nothing is really sent); quiz editing locks after the first attempt; the
timer auto-submits at zero; an abandoned attempt is closed and graded by the server.

**Accessibility scan:** axe-core checks about 30 pages for all three roles, in light and dark theme,
against WCAG 2.1 A/AA (contrast, labels, names, nesting, ARIA). It currently reports no violations.
Automated tools catch only part of the problems: also try each flow with the keyboard alone and with
a screen reader (NVDA is free on Windows).

**Not covered automatically:** whiteboard collaboration, and the AI features (switched off by
default; to be re-tested when AI is enabled). Streamed pages that end in "not found" keep HTTP
status 200 with a `noindex` tag; this is standard Next.js streaming behaviour.
