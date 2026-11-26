# eduWave (Next.js rebuild)

A reference rebuild of [eduWave](https://github.com/suraj719/eduWave), a MERN classroom app by
suraj719, using a current stack. Teachers manage classes, students, quizzes and resources.
Students take timed quizzes and track their progress.

The goal was not only to change frameworks. It was to fix the original's architectural problems,
mainly **browser-side grading** and **a public API that exposed student data**. Each fix is
commented at the point in the code where it's made.

| Layer | Original | This version |
|---|---|---|
| Framework | Create React App (deprecated) + separate Express API | Next.js 16 App Router (Server Components + Server Actions) |
| Language | JavaScript | TypeScript (strict) |
| Database | MongoDB, mostly `Mixed` fields | PostgreSQL via Drizzle ORM, with foreign keys and constraints |
| Auth | JWT in `localStorage`, 12 h, not revocable | httpOnly cookie + hashed session token in the DB, revocable |
| Validation | none | Zod on every Server Action |
| Styling | Tailwind 3 + Material-UI v4 | Tailwind 4 with design tokens and dark mode |

## Quick start

Requires Node.js 20+. No database install is needed: without `DATABASE_URL`, the app uses
[PGlite](https://pglite.dev), a real Postgres compiled to WebAssembly that stores its data in `./.pglite`.

```bash
npm install
cp .env.example .env.local   # then edit TEACHER_INVITE_CODE
npm run db:migrate
npm run db:seed              # demo data
npm run dev                  # http://localhost:3000
```

Demo logins (from the seed):

| Role | Login | Password |
|---|---|---|
| Teacher | `teacher@example.com` | `teacher123` |
| Student | `S001`, `S002` or `S003` | `student123` |

> PGlite allows only one process to open the data directory at a time. Stop `npm run dev` before running
> `db:migrate` or `db:seed`. To reset everything, delete `.pglite/` and run both again.

**Hosted Postgres** (e.g. Neon or Supabase free tier, needed for deployment): set `DATABASE_URL` and run
`npm run db:migrate`. No code changes are required.

### Scripts

| Script | Purpose |
|---|---|
| `dev` / `build` / `start` | Next.js |
| `lint`, `typecheck` | ESLint, `tsc --noEmit` |
| `db:generate` | After editing `src/db/schema.ts`, generate a new SQL migration in `drizzle/` |
| `db:migrate` | Apply migrations |
| `db:seed` | Insert demo data (skips if already present) |

## Project layout

```
src/
  db/schema.ts            tables, keys, constraints (start reading here)
  db/index.ts             PGlite or node-postgres, behind one Drizzle API
  lib/auth/               session cookies, password hashing, rate limit, Data Access Layer
  lib/quiz-engine.ts      timer + grading rules (server-side)
  lib/data.ts             read queries, each scoped to what the caller may see
  app/actions/            Server Actions (all writes): validate, authorize, mutate
  app/teacher/...         teacher pages
  app/student/...         student pages
  components/             UI primitives, app shell, shared widgets
  proxy.ts                fast redirect for signed-out visitors (not the security boundary)
```

### How a request is secured

1. `proxy.ts` sends visitors with no session cookie to `/login`. This is a convenience, not security.
2. Every page and Server Action calls `requireTeacher()` or `requireStudent()` (`lib/auth/dal.ts`). This
   check is the real security boundary.
3. Queries are scoped by ownership: a teacher's class must have `teacher_id = me`, and a student's quiz
   must be in their own class. Anything else returns 404.

### How a quiz attempt works

1. **Start**: the server inserts an `attempts` row with `started_at = now()`. A unique
   `(quiz_id, student_id)` constraint rules out a second attempt.
2. **Answer**: each click calls `saveAnswer`. The server rejects it once
   `min(started_at + limit, deadline) + 10 s grace` has passed.
3. **Submit**: grading is done in SQL by comparing saved answers with `questions.correct_index`. If the
   student just closes the tab, the attempt is finalised the next time it's viewed.
4. **Results**: correct answers are sent to the browser only after submission **and** after the deadline.

The client-side countdown is only a display. Editing the JavaScript or the device clock gives no extra time.

## Fixes over the original

| Original problem | Fix here |
|---|---|
| `GET /api/get-students` returned every student's password hash and parents' contact details to anyone | No such endpoint. The leaderboard query selects only names and aggregate scores. |
| Score and accuracy computed in the browser and trusted by the server | Graded in SQL from stored answers |
| Quiz answers sent to students before the attempt | `correctIndex` is stripped until after the deadline (checked by the E2E test) |
| Unlimited re-attempts | Unique DB constraint, one attempt per quiz |
| Anyone could register as a teacher | Teacher sign-up requires `TEACHER_INVITE_CODE` |
| Open student self-registration | Only teachers create student accounts |
| OpenAI, api-ninjas and VideoSDK keys in the frontend bundle | No third-party keys in client code. Future integrations must be called from the server. |
| Middleware crashed with no `Authorization` header | Session lookup handles a missing or expired cookie |
| No brute-force protection | Login rate limit (in-memory; see note in `rate-limit.ts`) |
| Forced fullscreen, `alert()` on window blur, "leave page?" prompt everywhere | Opt-in focus mode during quizzes |

## Not yet rebuilt (roadmap)

This is the core MVP. Features from the original that are deliberately left for later phases:

- **Quiz notification emails.** Send from a background job (e.g. a queue or cron route) so mail failures
  can't break quiz creation. A comment marks the spot in `createQuiz`.
- **File uploads for resources.** Links only for now. Use object storage with signed uploads
  (S3/R2/UploadThing) and server-side checks on file type and size.
- **Live classes.** Replace the copied VideoSDK sample (about 23k lines, tokens expired) with a hosted
  SDK such as LiveKit, Daily or Jitsi, with room tokens issued per user by a server route.
- **Whiteboard/canvas.** Use a library such as tldraw or Excalidraw instead of custom Fabric.js code.
- **AI study assistant.** Proxy through a Server Action that holds the API key, with per-user rate limits.
- **Question shuffling, partial credit, question banks, CSV import of students.**
- **Password reset / change.** Students currently get passwords from their teacher.

## Testing

`npm run lint`, `npm run typecheck` and `npm run build` all pass. The core flow was tested end to end in
a real browser (Edge driven by Playwright), 20 checks:

- **Teacher:** login (wrong and correct password), add student, reject `javascript:` URL, publish quiz.
- **Student:** login, blocked from teacher pages, start quiz, answer key absent from the page, answers
  survive reload, server grading (1/2), answers hidden before deadline, no second attempt.
- **Shared:** leaderboard, stats, 404 for another class's quiz, teacher analytics.

Not yet automated: timer expiry (auto-submit, and rejection of late answers) and concurrent submissions.
Adding a Playwright suite to this repo with those cases is the most valuable next step.

## Suggested exercises (for teaching)

1. Add a **Vitest** unit test for `attemptEndsAt` / `isAttemptOpen`, covering a start time close to the deadline.
2. Add **question shuffling** per attempt without leaking which option index is correct.
   Hint: store the permutation on the attempt.
3. Replace the in-memory rate limiter with a shared store, and explain why serverless needs one.
4. Add a **CSV import** for students, validating each row with the same Zod schema as `addStudent`.
5. Measure whether the opt-in focus mode is used. What would count as evidence that it helps?
