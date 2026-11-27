# Repository audit

**Date:** 2026-11-27 · **Branch:** `master` at `ea1b9b3` (same as `origin/master`; working tree clean before the audit).

**Companion documents:**

| Document | Contents |
|---|---|
| `FEATURE_INVENTORY.md` | Every feature and its status |
| `MOODLE_CAPABILITY_MATRIX.md` | Comparison with Moodle |
| `PRODUCTION_AUDIT.md` | Security and integrity findings history |
| `SECURITY_REVIEW.md` | Review against the institutional requirements |
| `IMPLEMENTATION_ROADMAP.md` | The plan |

## 1. Baseline (Phase 0)

| Check | Result | Evidence |
|---|---|---|
| CI on `master` | **Green**: quality, PostgreSQL integrity and browser suites | GitHub Actions run `45961940139`, commit `ea1b9b3` |
| Earlier CI failure (`PageProps`, `LayoutProps`, `RouteContext`) | **Fixed in 4.0.1** (`next typegen && tsc`); not present now | CI green; local typecheck clean |
| `npm run lint` / `typecheck` | Pass (local) | — |
| `test:db` | 22/22 (local, fresh PGlite) | — |
| `test:e2e` / `stability` / `security` / `a11y` | Pass in CI on `ea1b9b3` (42 / 15 / 10 / 0 violations) | Same commit, run locally in 4.0.1 too |
| Migrations | 0000 → 0002 verified on PGlite and PostgreSQL 18 (fresh install and upgrade) | `docs/TESTING.md` |

## 2. Technical overview

| Area | Finding |
|---|---|
| **Stack** | Next.js 16.4 (App Router, Server Actions, PPR), React 19, TypeScript strict, Drizzle 0.45, PostgreSQL / PGlite, Zod 4, Tailwind 4 |
| **Size** | ~10.5k lines of TS/TSX in `src/`. 33 pages, 6 route handlers, 48 Server Actions in 8 files, 23 tables, 3 migrations |
| **Dependencies (runtime)** | pglite, excalidraw, bcryptjs, drizzle-orm, lucide-react, next, nodemailer, papaparse, pg, react, recharts, server-only, sonner, zod. **All used; none unnecessary.** `canvas-confetti` was removed in 4.0 |
| **Code organisation** | By technical layer: `app/actions/*` grouped **by role** (admin, instructor, student) and `lib/data/*` grouped **by domain**. `actions/instructor.ts` (~560 lines) spans sections, enrolment, resources, assignments, quizzes, AI and live classes |
| **AuthN/AuthZ** | Central DAL plus `access.ts`. Authorisation re-verified in 4.0.1; see `SECURITY.md` |
| **Data integrity** | Composite FKs, CHECKs, RESTRICT deletes, 9 triggers, transactional quiz and grading paths (`DATABASE.md`) |
| **Files** | Stored in PostgreSQL `bytea`; metadata-first ACL. No storage abstraction yet |
| **Real-time** | None. Notifications poll a 2-query summary every 30 s. No WebSocket or SSE server |
| **Live class** | Link-out to a Jitsi room (public meet.jit.si by default). No API integration, authentication or presence |
| **Whiteboard** | Excalidraw editor with single-user autosave to the database. Excalidraw's collaboration needs a relay server, which is not present |
| **AI** | Ollama via server-side fetch: chat streaming and JSON-schema question drafting. No retrieval or embeddings. Off unless `OLLAMA_URL` is set at build |
| **Errors / logging** | Per-role error boundaries; `onRequestError` writes structured JSON lines; no metrics or health endpoint |
| **Config** | Zod-validated env; production refuses unsafe configs; `.env.production.example` |
| **Deploy** | systemd + Caddy documented; no Dockerfile (not testable here) |
| **Tests** | e2e (42), stability (15), security (10), db-integrity (22), a11y. **No unit tests** |

## 3. Findings

| # | Type | Finding | Location | Action |
|---|---|---|---|---|
| A-01 | **Architecture** | Three hard-coded roles, and one instructor per course. Can't express HOD, coordinator, TA, department admin, or faculty teaching several sections | `users.role`, `courses.instructor_id`, `dal.ts`, `access.ts` | Phase 2: course staff table + scoped role assignments + permission checks (non-destructive migration) |
| A-02 | **Architecture** | No academic hierarchy. Department and term are free text on `courses` | `schema.ts` | Phase 2: departments, programmes, sessions, semesters, batches, sections; nullable FKs on courses, back-filled |
| A-03 | Maintainability | Actions grouped by role, not domain; `instructor.ts` is large | `src/app/actions/` | Split by domain as each area is touched (no big-bang refactor) |
| A-04 | Testing | No unit tests for pure logic (grade policy, quiz layout and scoring, CSV escaping, env validation) | `src/lib/*` | **Done:** `test:unit` (21 checks). Environment validation still covered only by the startup probes |
| A-05 | Dead code | `liveSessionsFor()` and `ProgressChart` are unused | `lib/data/activity.ts`, `components/client/charts.tsx` | **Removed (Phase 0)** |
| A-06 | Design consistency | Course colour swatches in settings still use a gradient | `instructor/courses/[courseId]/page.tsx` | **Fixed (Phase 0)** |
| A-07 | AI prompt | Tutor and question prompts address "school students" | `lib/ai.ts` | **Fixed (Phase 0)** |
| A-08 | Feature gaps | Attendance missing; quiz has one question type and one attempt; no question bank, rubrics, gradebook categories or completion conditions | — | Phase 3 (see roadmap) |
| A-09 | Live class | Public Jitsi; no authentication, moderation or attendance; join window is UI-only | `lib/live.ts` | Phase 4 (self-hosted Jitsi + JWT; needs infrastructure decision D5) |
| A-10 | Whiteboard | No real-time collaboration (no relay server) | boards | Phase 4 (self-hosted `excalidraw-room`-style relay or Yjs; evaluate) |
| A-11 | AI | Not course-aware; no retrieval or access-controlled context | `lib/ai.ts` | Phase 5 (pgvector + Ollama embeddings, retrieval filtered by course access) |
| A-12 | Scale | Not load-tested. Several lists still unpaginated (catalogue, discussions, participants, gradebook) | — | Phase 6 (k6 load tests) + pagination as lists are touched |
| A-13 | Account recovery | Admin reset only; no self-service | — | Phase 6 (email reset tokens) or SSO (D2) |

No critical or high-severity security findings are open (see `SECURITY_REVIEW.md`).
