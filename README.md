# eduWave LMS

An open-source **learning management system for universities**, in the spirit of Moodle: courses
organised into weekly sections, assignments with grading and feedback, server-timed quizzes, a
gradebook, discussions and announcements, a calendar, live classes, whiteboards and a private AI tutor,
for **students**, **instructors** and **administrators**.

It began as a rebuild of [eduWave](https://github.com/suraj719/eduWave), a MERN student project by
suraj719, and has grown into a full LMS.

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

**Instructors**: build courses week by week (sections, files, links, live classes); create
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
| AI tutor + AI quiz drafting | Install [Ollama](https://ollama.com), `ollama pull llama3.2`, set `OLLAMA_URL=http://localhost:11434` (8 GB+ RAM recommended) |
| Email notifications | Any SMTP account in `.env.local`, e.g. a Gmail **App Password** |
| Hosted database | Set `DATABASE_URL` (Neon/Supabase free tier), then `npm run db:migrate` |
| Self-hosted video | Run Jitsi on campus and set `JITSI_DOMAIN` |

Without them everything else works; AI pages show setup instructions and notifications stay in-app.

**Notes:** on meet.jit.si the first person in a room signs in to become moderator, so instructors
should start the class first. Small local AI models make mistakes, so AI-drafted questions are drafts
for review. Files are stored in Postgres, which is fine for course materials and submissions; move
large media to object storage if needed.

---

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
scripts/                  migrate, seed, create-admin
tests/e2e.mjs             end-to-end browser test
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
| `test:e2e` | Browser test of the main flows |

## Testing

```bash
rm -rf .pglite && npm run db:migrate && npm run db:seed
npm run build && npm start -- -p 3100          # leave OLLAMA_URL unset
npm run test:e2e                                # second terminal
```

**42 checks** across all three roles: security headers and redirects; admin creates a student and a
course; instructor sets an enrolment key, adds material, publishes an assignment, a quiz and an
announcement; student forced password change, password policy, wrong/right enrolment key, completion
progress, file submission, quiz with answer-key protection and server grading, discussion reply,
calendar; cross-user security (exports, other students' files, non-enrolled courses, other instructors'
courses); grading with a server-enforced maximum, CSV export, grade notification; instant deactivation;
account lockout. Uses the installed Edge (`BROWSER_CHANNEL=chrome` for Chrome).

**Not covered automatically:** timer expiry (auto-submit at zero), email delivery, whiteboard
collaboration, and AI output quality. The AI integration was tested against a mock Ollama server.
