# eduWave (Next.js rebuild)

A classroom platform for teachers and students: classes, timed quizzes, resources,
live lessons, whiteboards, an AI tutor and progress analytics. It is a reference rebuild of
[eduWave](https://github.com/suraj719/eduWave), a MERN project by suraj719, on a current
stack, with the original's security problems fixed.

**Everything is free.** There are no paid APIs, no API keys in the browser, and no service that
needs a credit card. Optional extras (AI, email, hosted database) use free/open-source options.

| Layer | Original | This version |
|---|---|---|
| Framework | Create React App (deprecated) + Express API | Next.js 16 (Server Components, Server Actions) |
| Language | JavaScript | TypeScript (strict) |
| Database | MongoDB, mostly untyped `Mixed` fields | PostgreSQL via Drizzle ORM: foreign keys, constraints, indexes |
| Auth | JWT in `localStorage` | httpOnly cookie + hashed, revocable DB session |
| Files | Firebase Storage | Stored in Postgres (no extra service) |
| Video | VideoSDK (paid; tokens hard-coded and expired) | Jitsi Meet (free, open-source) |
| AI chat | OpenAI key exposed in the browser | Ollama: open models on your own machine |
| UI | Tailwind 3 + Material-UI v4 | Tailwind 4, design tokens, dark mode, lucide icons |

## Quick start

Requires Node.js 20+. No database install needed: without `DATABASE_URL`, the app uses
[PGlite](https://pglite.dev), a real Postgres compiled to WebAssembly, stored in `./.pglite`.

```bash
npm install                 # also copies the whiteboard fonts into public/
cp .env.example .env.local  # set TEACHER_INVITE_CODE
npm run db:migrate
npm run db:seed             # demo data
npm run dev                 # http://localhost:3000
```

| Demo login | Username | Password |
|---|---|---|
| Teacher | `teacher@example.com` | `teacher123` |
| Student | `S001`, `S002`, `S003` | `student123` |

The seed includes an open quiz, a **closed quiz with results** (so charts, leaderboards and
revealed answers have data), a resource, a scheduled live class and notifications. Demo
passwords are deliberately weak; real accounts must pass the password policy.

> PGlite lets one process open `.pglite/` at a time. Stop the app before `db:migrate` or `db:seed`.
> To reset: delete `.pglite/` and run both again.

## Features

**Teachers**
- Dashboard: classes with averages, open quizzes with submission progress, upcoming live classes, to-do list
- Class page (tabs): quizzes · students · resources · live classes · leaderboard
- Students: add one at a time or **import a CSV**. The server generates a temporary password that is shown once and must be changed at first login. Reset a password with one click, which also signs the student out everywhere.
- Quiz builder: reorder or duplicate questions, 2–6 options, per-question explanations, **shuffle per student**, **AI drafting** from pasted notes (optional)
- Quiz analytics: score distribution chart, per-option pick counts (spot common misconceptions), time taken, **CSV export**
- Resources: **file upload** (PDF, images, Office, TXT/CSV, up to 8 MB, drag & drop) or links
- Live classes: schedule a Jitsi room; students are notified; the join button opens 15 min before the start
- Whiteboards (Excalidraw): autosaved; can be **shared read-only with a class**

**Students**
- Dashboard: what's due (with urgency), "live now" banner, **Pomodoro study timer**, to-do list with due dates
- Quizzes: server-timed, autosaved answers, keyboard shortcuts (1–6, ←/→), "jump to unanswered", opt-in focus mode, confetti for scores of 80% or more; answers and explanations appear after the deadline
- Progress: score vs class average per quiz, average by subject, focus suggestion, full history table
- Leaderboard with podium · searchable resources by subject · live classes · AI tutor · whiteboards

**Everyone**: in-app notification bell (polls every 30 s), light/dark/system theme, mobile layout,
Account & security page (change password, active devices, recent sign-in activity).

## Optional free services

| Feature | How to enable | Cost |
|---|---|---|
| AI tutor + AI quiz drafting | Install [Ollama](https://ollama.com), `ollama pull llama3.2`, set `OLLAMA_URL=http://localhost:11434` | Free; runs on your machine (8 GB+ RAM recommended) |
| Email notifications | Any SMTP account in `.env.local` (e.g. a Gmail **App Password**) | Free |
| Hosted database | Set `DATABASE_URL` (Neon/Supabase free tier), run `npm run db:migrate` | Free tier |
| Live classes | Works out of the box with meet.jit.si; self-host Jitsi and set `JITSI_DOMAIN` for full control | Free |

Without these, the app still works fully: AI pages show setup instructions and notifications stay in-app.

**Notes and limitations:**
- **meet.jit.si:** the first person in a room signs in (Google/GitHub/Facebook) to become moderator. Teachers should start the class before students join. The app opens Jitsi in a new tab; embedding the public instance is time-limited for third-party sites.
- **Ollama:** small local models make mistakes. AI-drafted questions are drafts for the teacher to review, and the tutor tells students to verify facts. A slower laptop may take 30–60 s per draft.
- **Files in Postgres:** fine for class-sized use (the Neon free tier is about 0.5 GB). For large media, move to object storage.

## Security model

How a request is protected:
1. `src/proxy.ts` redirects visitors with no session cookie (a fast check only).
2. Every page, Server Action and route handler calls the **Data Access Layer** (`src/lib/auth/dal.ts`). That check is the real security boundary.
3. Every query is scoped by ownership: a teacher's own classes, a student's own class. Anything else returns 404.

| Threat | Protection |
|---|---|
| Stolen login via XSS | httpOnly session cookie; React escaping; CSP; AI Markdown rendered without `innerHTML` |
| Stolen database rows | Passwords hashed with bcrypt (cost 12); sessions stored as SHA-256 of the token |
| Password guessing | **DB-backed lockout**: 5 failures per account or 30 per IP in 15 min → 15-min lock. Generic error messages and dummy hashing so accounts can't be enumerated |
| Weak passwords | At least 10 characters plus a common-password deny-list (NIST 800-63B style) |
| Shared/teacher-issued passwords | Forced change at first login; changing a password signs out other devices; teacher reset revokes all sessions |
| Cheating | Server-side timer and grading; one attempt (DB unique constraint); answer key never sent before the deadline; per-student shuffled order (crypto RNG); client sends display positions that the server maps back |
| Malicious uploads | Extension allow-list **and magic-byte check**; 8 MB cap; sanitised filenames; `nosniff`; non-image files download as attachments; access limited to the class |
| Malicious links / CSV | Only `http(s)` URLs; CSV export neutralises spreadsheet formula injection |
| Clickjacking, sniffing, framing | CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS in production |
| CSRF | Server Actions check the request origin; `SameSite=Lax` cookies |
| AI abuse | AI routes require login, are rate-limited per user (40 chats/h, 15 drafts/h), and cap message size and history |
| Auditability | Sign-ins, failures, lockouts and password changes are logged and shown to the user |

**Trade-off to discuss in class:** the CSP allows `'unsafe-inline'` scripts because Next.js
inlines bootstrap scripts. Removing it requires per-request nonces, which disables static
prerendering. The other directives still block third-party scripts, plugins, framing and form hijacking.

**Dependencies:** `npm audit --omit=dev` reports 0 vulnerabilities. Vulnerable sub-dependencies
of the whiteboard (lodash-es, nanoid, katex) are pinned to patched versions via `overrides` in
`package.json`. The full `npm audit` still lists an old `esbuild` inside `drizzle-kit` (a dev-only
CLI). The advisory concerns esbuild's dev web server, which drizzle-kit doesn't run, and the
suggested "fix" is a large downgrade, so it's left as is.

## Project layout

```
src/
  db/schema.ts              tables, keys, constraints, indexes (start reading here)
  db/index.ts               PGlite or node-postgres behind one Drizzle API (lazy connection)
  lib/auth/                 sessions, passwords, lockout/rate limits, Data Access Layer
  lib/quiz-engine.ts        timer, shuffle layouts, grading
  lib/data.ts               read queries, each scoped to what the caller may see
  lib/{ai,notify,uploads,audit}.ts
  app/actions/              Server Actions (all writes): validate (Zod) → authorise → mutate
  app/api/, app/files/      route handlers: AI streaming, notifications, file downloads, CSV
  app/teacher/…, app/student/…
  components/               server components + components/client/* (interactive pieces)
tests/e2e.mjs               end-to-end browser test
```

## Scripts

| Script | Purpose |
|---|---|
| `dev` / `build` / `start` | Next.js |
| `lint`, `typecheck` | ESLint, `tsc --noEmit` |
| `db:generate` | After editing `src/db/schema.ts`, generate a SQL migration in `drizzle/` |
| `db:migrate`, `db:seed` | Apply migrations, insert demo data |
| `test:e2e` | Browser test of the main flows (see below) |

## Testing

```bash
rm -rf .pglite && npm run db:migrate && npm run db:seed
npm run build && npm start -- -p 3100          # leave OLLAMA_URL unset
npm run test:e2e                                # in a second terminal
```

The suite runs **35 checks** in a real browser: security headers; class, quiz and student counts;
temp-password issuance and forced change; password policy; uploads (disguised HTML rejected);
`javascript:` links rejected; Jitsi scheduling; quiz publish, shuffled attempt, absence of the answer
key, persistence across reload, server grading; notifications; file access; whiteboard autosave;
charts; post-deadline answer reveal; leaderboard; cross-user access denied; CSV export permissions;
account lockout; audit log.

It uses the installed Edge (Windows default); set `BROWSER_CHANNEL=chrome` for Chrome.

**Not covered by automated tests:** the timer-expiry path (auto-submit at zero, rejection of late
answers), email sending, and AI quality against a real model. The AI integration was checked
against a mock Ollama server, which tests streaming, parsing and filtering but not model output.

## Suggested exercises

1. Add Vitest unit tests for `attemptEndsAt`, `isAttemptOpen` and `buildLayout`, including a quiz started 1 minute before its deadline.
2. Add an E2E test for timer expiry using a 1-minute quiz.
3. Replace notification polling with Server-Sent Events. What changes on serverless hosting?
4. Add question banks: reuse questions across quizzes. What schema changes are needed?
5. Add two-factor login (TOTP) for teachers, with free libraries only.
6. Measure whether the study timer and focus mode are used. What data would show they help, and what are the privacy implications of collecting it?
