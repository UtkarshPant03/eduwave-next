# Moodle capability matrix

Moodle is used as a **benchmark for academic completeness**, not as a template.

**Sources:** official Moodle documentation, docs.moodle.org (5.3 tree), read on 2026-11-27.

**Pages read:** Activities, Resources, Question types, Grade aggregation, Assignment settings, Rubrics, Marking guide, Quiz settings, Question behaviours, Random question type, Activity completion, Restrict access settings, Course completion settings, Course formats, Course backup, Badges, Competencies, Cohorts, Groups, Roles and permissions, Standard roles, Context, Attendance activity.

**Verified Moodle facts used below:**
- **Attendance** is a **third-party plugin** (mod_attendance), not core.
- **Gradebook:** the only aggregation enabled by default is "Natural".
- **Quiz:** grading methods are highest, average, first and last; navigation is free or sequential.
- **Core question types:** 17. "Random" is a way to insert a question from a category, not a type.
- **Roles** apply within contexts: system → course category → course → activity → block.

**eduWave status (from `FEATURE_INVENTORY.md`):**

| Code | Meaning |
|---|---|
| **Have** | Implemented and verified |
| **Partial** | Partly implemented |
| **Rec** | Missing; recommended for Graphic Era |
| **Opt** | Missing; optional |
| **N/A** | Not suitable for eduWave |

**Priority:** P1 (next), P2, P3.

## Course management

| Capability | Moodle | eduWave | Class | Pri | Notes |
|---|---|---|---|---|---|
| Course create/edit | core | create (admin), settings (instructor) | **Partial** | P1 | Admin course detail page missing |
| Course categories | core | — | **Rec** | P1 | In eduWave this becomes department → programme (Phase 2), not a free category tree |
| Formats (custom sections, weekly, single activity) | core | weekly sections | **Have** | — | Topic naming is free text; enough |
| Visibility | core | published flag | **Have** | — | — |
| Enrolment (manual, self with key, cohort sync) | core | manual list, self-key | **Partial** | P1 | Add enrolment by section or batch (cohort equivalent) |
| Course duplication, import, backup/restore | core | site-level DB backup only | **Opt** | P3 | Per-course copy is useful each semester; later |
| Course completion criteria | core | — | **Rec** | P2 | Start with "all required activities complete" |
| Restrict access (date, completion, grade, group, profile, nested) | core | — | **Rec** | P2 | Date and completion first |
| Course-level roles (teacher, non-editing teacher) | core | single instructor | **Rec** | P1 | Course staff: coordinator, faculty, TA |
| Course reports | core | gradebook/quiz CSV | **Partial** | P2 | Participation and activity reports |

## Learning resources

| Capability | Moodle | eduWave | Class | Pri |
|---|---|---|---|---|
| File | core | single file, 8 MB, validated | **Have** | — |
| URL | core | yes | **Have** | — |
| Page (rich text) | core | — (descriptions only) | **Rec** | P2 |
| Folder / multiple files | core | — | **Rec** | P2 |
| Book (multi-page) | core | — | **Opt** | P3 |
| Text and media area (label) | core | section summary only | **Rec** | P2 |
| Embedded video | core (media filters) | link only | **Opt** | P3 (embed allow-listed hosts; CSP impact) |
| PDF preview | core viewer | staff PDFs open inline | **Partial** | — |
| IMS content package / SCORM | core | — | **N/A** for now | — |
| Resource completion and restrictions | core | manual tick | **Partial** | P2 |

## Assignments

| Capability | Moodle | eduWave | Class | Pri |
|---|---|---|---|---|
| Online text / file submission | core | text + 1 file | **Partial** | P1 (multiple files) |
| Due date / cut-off | core | due + late days (acts as cut-off) | **Have** | — |
| Resubmission and submission history | core (attempts reopened) | overwrite until graded | **Partial** | P1 (keep history) |
| Group submission | core | — | **Rec** | P2 (needs groups) |
| Rubric / marking guide | core (advanced grading) | — | **Rec** | P2 |
| Anonymous submissions | core | — | **Opt** | P3 |
| Feedback comments / feedback files | core | comments only | **Partial** | P2 |
| Marking workflow and grade release | core | immediate release | **Rec** | P2 |
| Bulk download / offline grading worksheet | core | — | **Rec** | P2 |
| Submission statement | core | — | **Opt** | P3 (academic integrity declaration) |

## Quiz and question bank

| Capability | Moodle | eduWave | Class | Pri |
|---|---|---|---|---|
| Multiple choice (single answer) | core | yes | **Have** | — |
| Multiple choice (multi-answer), true/false, short answer, numerical | core | — | **Rec** | P1 |
| Essay with manual grading | core | — | **Rec** | P2 |
| Matching, ordering, cloze, drag and drop, calculated | core | — | **Opt** | P3 |
| Question bank, categories, tags, random from category | core | per-quiz questions only | **Rec** | P1 |
| Open/close dates; time limit; auto-submit | core | deadline + limit + auto-submit | **Partial** | P1 (open date) |
| Multiple attempts + grading method | core | one attempt | **Rec** | P1 |
| Navigation free/sequential | core | free | **Opt** | P2 |
| Review options by timeframe | core | fixed: after deadline + grace | **Partial** | P2 |
| Negative marking (via penalty/CBM) | core (behaviours) | — | **Opt** | P2 (configurable per quiz if policy wants it) |
| Overrides (user/group extra time) | core | — | **Rec** | P2 (accommodations) |
| Analytics and reports | core | distribution + per-question picks + CSV | **Have** | — |
| Safe Exam Browser / IP restriction | core | — | **Opt** | P3 |

## Gradebook

| Capability | Moodle | eduWave | Class | Pri |
|---|---|---|---|---|
| Gradebook with totals | core | points sum + 10-pt letters | **Partial** | P1 |
| Categories and weights (Natural, weighted mean) | core | — | **Rec** | P1 (internal / mid-sem / end-sem weighting is common) |
| Scales | core | one built-in scale | **Partial** | P2 (scale as data) |
| Overrides with history | core | assignment grade history only | **Rec** | P2 |
| Hidden grades / release | core | — | **Rec** | P2 |
| Export | core | CSV | **Have** | — |

## Completion and progress

| Capability | Moodle | eduWave | Class | Pri |
|---|---|---|---|---|
| Activity completion (view, grade, manual) | core | manual + submit | **Partial** | P2 |
| Course completion | core | — | **Rec** | P2 |
| Conditional availability | core | — | **Rec** | P2 |
| Progress indicators | core | yes | **Have** | — |
| Competencies, learning plans | core (enable setting) | — | **Opt** | P3 (useful for outcome-based education / NBA accreditation; confirm need) |
| Badges | core | — | **Opt** | P3 |

## Communication and collaboration

| Capability | Moodle | eduWave | Class | Pri |
|---|---|---|---|---|
| Announcements and forums | core | course forum + announcements | **Have** | — |
| Groups / groupings | core | — | **Rec** | P2 |
| Direct messaging | core | — | **Opt** | P3 |
| Notifications | core | in-app + email | **Have** | — |
| Calendar (course + personal events) | core | course deadlines and live classes | **Partial** | P2 |
| Choice (polls), Feedback (surveys) | core | — | **Opt** | P3 |
| Workshop (peer assessment), Wiki, Glossary, Database | core | — | **Opt** / **N/A** | P3 |
| BigBlueButton (core live class) | core | Jitsi integration | **Partial** (different tool) | P1 (security) |

## Attendance (Moodle plugin, not core)

| Capability | eduWave | Class | Pri |
|---|---|---|---|
| Sessions, statuses, reports, student history, percentages | Have (4.3) | **Rec** | **P1** (essential for Indian universities) |
| Corrections, audit, policies, live-class integration | Corrections with approval and history, per-course minimum (4.3); live-class integration in Phase 4 | **Rec** | P1 / P2 |

## Administration and roles

| Capability | Moodle | eduWave | Class | Pri |
|---|---|---|---|---|
| Bulk user upload (CSV) | core | CSV | **Have** | — |
| Excel import | — | — | **Opt** | P3 (CSV export from Excel suffices) |
| Suspension | core | deactivate | **Have** | — |
| Roles and capabilities in contexts | core | 3 fixed roles | **Rec** | **P1** (scoped permission model) |
| Cohorts | core | — | **Rec** | P1 (sections and batches play this role) |
| Reports (logs, participation, activity, grades) | core | audit log + CSVs | **Partial** | P2 |

## Not adopted from Moodle (by design)

- **Moodle's UI, plugin architecture, and filesystem-based "moodledata" storage:** eduWave stays a single Next.js modular monolith.
- **Course categories as a free tree:** replaced by Graphic Era's real academic hierarchy.
