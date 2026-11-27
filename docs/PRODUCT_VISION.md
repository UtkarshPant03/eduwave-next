# eduWave: product vision

## What eduWave is

eduWave is an integrated university learning management system, built first for **Graphic Era Deemed to be University, Dehradun**. It brings teaching, assessment, academic administration, communication and collaboration into one platform.

**Moodle is a benchmark, not a template.** eduWave should match Moodle's academic completeness where that matters to Graphic Era (`MOODLE_CAPABILITY_MATRIX.md`). It should not copy Moodle's interface or architecture.

## What makes eduWave different

| Differentiator | Current state | Direction |
|---|---|---|
| **Integrated live classroom** | Scheduled Jitsi rooms linked from the course outline | Self-hosted, authenticated rooms; attendance from live classes; whiteboard and resources inside the class |
| **Collaborative whiteboard** | Personal Excalidraw boards, shareable read-only with a course | Real-time multi-user boards, course-linked boards, saving to course resources, PDF annotation |
| **AI assistance (local first)** | Optional Ollama tutor chat; AI drafting of quiz questions | Course-aware assistant drawing only on authorised course material; summaries; faculty assistant; always reviewed by staff, always labelled as AI |
| **One academic workflow** | Course → sections → activities → gradebook, notifications, calendar | Institution → department → programme → semester → batch → section → course, so offerings, enrolment and reports follow the university's real structure |
| **Data you can trust** | Database-enforced integrity, grade history, audit log, transactional quizzes | Extended to attendance and every academic change |

## Principles

1. **Reliability over feature count.** A feature counts as done only when it works end to end, is authorised on the server, keeps its data consistent and has tests.
2. **Free and self-hostable.** No mandatory paid services. Optional adapters (SMTP, external AI) are allowed but never required.
3. **Single institution first.** No multi-tenant SaaS machinery. Institutional structure, policies and thresholds are **data and configuration**, not code.
4. **Never invent institutional facts.** Graphic Era's ERP APIs, SSO endpoints, attendance rules and examination policies are integration boundaries to configure once they are provided (`IMPLEMENTATION_ROADMAP.md`, "Decisions needed").
5. **Preserve what works.** Improve rather than replace. Any breaking change is documented with a migration path.

## Who it serves

| Role | Outcome |
|---|---|
| Student | Courses, materials, assignments, assessments, grades, attendance, discussions, live classes and collaborative tools, all in one place |
| Faculty | Run teaching, live classes, assessments, evaluation and progress monitoring |
| Course coordinator / HOD / department admin | Manage a department's offerings and produce meaningful reports, within the department's scope |
| University administrators | Institution-wide oversight and control, with a full audit trail |

## Success

The goal is not the largest number of features. It is features that work reliably together, securely and consistently.
