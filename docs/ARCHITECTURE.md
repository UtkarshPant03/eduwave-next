# Architecture

eduWave is a single Next.js 16 application: server-rendered React with Server Actions, backed by PostgreSQL. There are no microservices and no client-side data stores.

```
Browser ──HTTPS──▶ reverse proxy (Caddy/Nginx) ──▶ Next.js server ──▶ PostgreSQL
                                                     │
                                                     ├─ optional: SMTP server (email)
                                                     ├─ optional: Ollama (AI, server-side only)
                                                     └─ link-out: Jitsi (video, opens in a new tab)
```

## Request path

1. **`src/proxy.ts`** (optimistic): redirects visitors without a session cookie to `/login`. It is not the security boundary.
2. **Page / Server Action / route handler** calls the **Data Access Layer** (`src/lib/auth/dal.ts`):
   - `getCurrentUser` validates the session: the hashed token is looked up and the expiry and the `active` flag are checked.
   - `requireAdmin`, `requireInstructor` and `requireStudent` add the role check and the forced password change.
   - `getActiveUser` is the route-handler variant: it returns null instead of redirecting.
3. **Course access** (`src/lib/access.ts`): `courseForInstructor` (owner), `courseForStudent` (enrolled + published), `courseForMember`. Denial is a 404.
4. **Read layer** (`src/lib/data/*.ts`): typed Drizzle queries per domain. Callers pass an already-authorised user or course.
5. **Write layer** (`src/app/actions/*.ts`): every action validates input (Zod) → authorises → writes, inside a transaction when several rows must agree → notifies.
6. **Database** (`docs/DATABASE.md`): constraints and triggers enforce the academic rules even if steps 2–5 had a bug.

## Directory map

| Path | Purpose |
|---|---|
| `src/db/schema.ts`, `drizzle/` | Schema, constraints, migrations |
| `src/lib/env.ts`, `src/lib/startup-checks.ts`, `src/instrumentation.ts` | Configuration validation and production refusal; structured error logging |
| `src/lib/auth/*` | Sessions, passwords, throttling, Data Access Layer |
| `src/lib/access.ts` | Course-level authorization |
| `src/lib/quiz-engine.ts` | Timer, shuffling, locked finalisation, expired-attempt sweep |
| `src/lib/grading.ts`, `src/lib/data/gradebook.ts` | Grade policy (pure functions) and the gradebook matrix |
| `src/lib/uploads.ts`, `src/app/files/[fileId]/route.ts` | Upload validation (extension, magic bytes, OOXML structure) and access-controlled download |
| `src/lib/audit.ts`, `src/lib/notify.ts` | Audit log (with actor and trusted IP); in-app and email notifications |
| `src/app/{admin,instructor,student}` | Role areas; each has `loading.tsx`, `error.tsx` and `not-found.tsx` |
| `src/components/ui.tsx`, `src/app/globals.css` | Design system: tokens and primitives |
| `scripts/` | migrate, seed (development only), create-admin, backup, restore |
| `tests/` | db-integrity, e2e, stability, security, a11y, smtp-catcher |

## Design decisions

| Decision | Reason | Trade-off |
|---|---|---|
| Server Actions instead of a REST API | One codebase, type-safe calls, built-in Origin checks (CSRF) | Action ids are public, so every action must validate and authorise its own input (tested in `tests/security.mjs`). |
| Files stored in PostgreSQL (`bytea`) | Zero extra infrastructure; backups include files | Database size grows with uploads. The download path authorises on metadata before reading the content, so a storage abstraction can later move contents to S3/MinIO without changing callers. |
| PGlite for development | Zero-install teaching labs | One process per data directory; never allowed in production. |
| Partial prerendering (`cacheComponents`) | Fast navigation; static shells | `notFound()` inside a streamed page returns HTTP 200 with `noindex`; the CSP needs `'unsafe-inline'` (see `docs/SECURITY.md`). |
| Database-level integrity | Rules hold regardless of code paths | Schema changes need hand-checked migrations (`docs/DATABASE.md`). |

## Target module boundaries (modular monolith)

eduWave stays **one deployable application**. Code is organised progressively into domain modules, each owning its schema tables, read queries, Server Actions and authorisation rules. Today, actions are grouped by role (`actions/instructor.ts` spans six domains).

| Domain | Today | Target location |
|---|---|---|
| Identity & access | `lib/auth/*`, `actions/auth.ts`, `access.ts` | `modules/identity` (+ capability map, `can()`) |
| Institution (departments … sections) | — | `modules/institution` (Phase 2) |
| Courses & content | `actions/instructor.ts` (sections, resources, enrolment), `lib/data/courses.ts` | `modules/courses` |
| Assignments | `actions/instructor.ts` + `student.ts` | `modules/assignments` |
| Assessments (quizzes, question bank) | `actions/*`, `quiz-engine.ts`, `data/assessments.ts` | `modules/assessments` |
| Gradebook | `grading.ts`, `data/gradebook.ts` | `modules/gradebook` |
| Attendance | — | `modules/attendance` (Phase 3) |
| Communication | `actions/community.ts`, `notify.ts` | `modules/communication` |
| Live classroom / whiteboard | `live.ts`, `actions/boards.ts` | `modules/classroom` |
| AI | `lib/ai.ts`, `api/ai/chat` | `modules/ai` (service interface; Ollama adapter) |

**Moving code.** A domain moves when it is next changed for a feature, with its tests. There is no big-bang refactor, and each move keeps the public action names, so the UI and tests don't change.

**Rule.** A module may call another module only through its exported functions. Pages never query tables directly; they use the module's read functions.
