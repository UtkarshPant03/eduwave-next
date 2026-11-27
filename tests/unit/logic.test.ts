/**
 * Unit tests for pure academic and security logic (Node's built-in test runner, no
 * extra dependency). Run: npm run test:unit
 *
 * These pin down rules that the browser suites only exercise indirectly: grade bands
 * and rounding, submission windows, quiz timing and shuffling, upload validation, CSV
 * formula escaping, and download disposition.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignmentWindow, courseTotal, letterFor } from "../../src/lib/grading";
import { attemptEndsAt, buildLayout, GRACE_MS, isAttemptOpen } from "../../src/lib/quiz-engine";
import { checkUpload, isInlineSafe, MAX_UPLOAD_BYTES } from "../../src/lib/uploads";
import { csvResponse } from "../../src/lib/csv";
import { staffCan } from "../../src/lib/auth/capabilities";
import { attendancePercent, belowThreshold } from "../../src/lib/attendance";

const DAY = 86_400_000;

describe("grade bands (10-point scale)", () => {
  it("maps band boundaries inclusively", () => {
    assert.equal(letterFor(90)?.letter, "O");
    assert.equal(letterFor(89.999)?.letter, "A+");
    assert.equal(letterFor(40)?.letter, "P");
    assert.equal(letterFor(39.9)?.letter, "F");
    assert.equal(letterFor(0)?.letter, "F");
  });
  it("returns null for no data", () => {
    assert.equal(letterFor(null), null);
    assert.equal(letterFor(Number.NaN), null);
  });
});

describe("course total", () => {
  it("counts only graded or closed items, and missing work as 0", () => {
    const t = courseTotal([
      { earned: 8, possible: 10, counted: true, status: "graded" },
      { earned: 0, possible: 10, counted: true, status: "missing" },
      { earned: null, possible: 10, counted: false, status: "submitted" },
      { earned: null, possible: 10, counted: false, status: "upcoming" },
    ]);
    assert.deepEqual([t.earned, t.possible, t.percent], [8, 20, 40]);
    assert.equal(t.letter?.letter, "P");
  });
  it("letter follows the DISPLAYED whole-number percentage (89.6 shows 90 → O)", () => {
    const t = courseTotal([{ earned: 896, possible: 1000, counted: true, status: "graded" }]);
    assert.equal(Math.round(t.percent!), 90);
    assert.equal(t.letter?.letter, "O");
  });
  it("has no letter before anything counts", () => {
    assert.equal(courseTotal([{ earned: null, possible: 10, counted: false, status: "upcoming" }]).letter, null);
  });
});

describe("assignment submission window", () => {
  const dueAt = new Date("2026-12-01T18:29:00Z");
  it("is on time until the due instant", () => {
    assert.deepEqual(
      { open: assignmentWindow({ dueAt, lateDays: 2 }, dueAt.getTime()).open, late: assignmentWindow({ dueAt, lateDays: 2 }, dueAt.getTime()).late },
      { open: true, late: false },
    );
  });
  it("is late but open inside the late window, and closed after it", () => {
    const w = assignmentWindow({ dueAt, lateDays: 2 }, dueAt.getTime() + DAY);
    assert.equal(w.open && w.late, true);
    assert.equal(assignmentWindow({ dueAt, lateDays: 2 }, dueAt.getTime() + 2 * DAY + 1).open, false);
  });
  it("with no late window, closes right at the due date", () => {
    assert.equal(assignmentWindow({ dueAt, lateDays: 0 }, dueAt.getTime() + 1).open, false);
  });
});

describe("quiz timing", () => {
  const startedAt = new Date("2026-12-01T10:00:00Z");
  it("gives the full time limit when the deadline is later", () => {
    const end = attemptEndsAt({ startedAt }, { timeLimitMinutes: 30, deadline: new Date("2026-12-01T12:00:00Z") });
    assert.equal(end.toISOString(), "2026-12-01T10:30:00.000Z");
  });
  it("never runs past the quiz deadline", () => {
    const end = attemptEndsAt({ startedAt }, { timeLimitMinutes: 30, deadline: new Date("2026-12-01T10:10:00Z") });
    assert.equal(end.toISOString(), "2026-12-01T10:10:00.000Z");
  });
  it("accepts answers during the grace period only", () => {
    const quiz = { timeLimitMinutes: 30, deadline: new Date("2026-12-02T00:00:00Z") };
    const end = startedAt.getTime() + 30 * 60_000;
    assert.equal(isAttemptOpen({ startedAt }, quiz, end + GRACE_MS), true);
    assert.equal(isAttemptOpen({ startedAt }, quiz, end + GRACE_MS + 1), false);
  });
});

describe("per-attempt shuffling", () => {
  const qs = Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, options: ["a", "b", "c", "d"] }));
  it("is a permutation of the questions and of every question's options", () => {
    const l = buildLayout(qs, true);
    assert.deepEqual([...l.questionOrder].sort(), qs.map((q) => q.id).sort());
    for (const q of qs) assert.deepEqual([...l.optionOrders[q.id]].sort(), [0, 1, 2, 3]);
  });
  it("keeps the original order when shuffling is off", () => {
    const l = buildLayout(qs, false);
    assert.deepEqual(l.questionOrder, qs.map((q) => q.id));
    assert.deepEqual(l.optionOrders.q0, [0, 1, 2, 3]);
  });
});

describe("upload validation", () => {
  // new Uint8Array(...) copies into a plain ArrayBuffer, the type File/Blob accept.
  const file = (name: string, bytes: Uint8Array | string) =>
    new File([new Uint8Array(typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes)], name);
  it("accepts a real PDF and normalises the stored name", async () => {
    const r = await checkUpload(file("Lab <3>.pdf", "%PDF-1.4\n%%EOF"));
    assert.ok(!("error" in r));
    assert.equal(r.mimeType, "application/pdf");
    assert.equal(r.name, "Lab _3_.pdf");
  });
  it("rejects HTML renamed to .pdf", async () => {
    assert.ok("error" in (await checkUpload(file("notes.pdf", "<html><script>x</script>"))));
  });
  it("rejects a plain ZIP renamed to .docx, accepts a real OOXML structure", async () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode("payload.exe")]);
    assert.ok("error" in (await checkUpload(file("report.docx", zip))));
    const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode("[Content_Types].xml word/document.xml")]);
    assert.ok(!("error" in (await checkUpload(file("report.docx", docx)))));
  });
  it("rejects WAV renamed to .webp, disallowed extensions, empty and oversized files", async () => {
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    assert.ok("error" in (await checkUpload(file("pic.webp", wav))));
    assert.ok("error" in (await checkUpload(file("run.exe", "MZ"))));
    assert.ok("error" in (await checkUpload(file("empty.txt", ""))));
    assert.ok("error" in (await checkUpload(file("big.txt", new Uint8Array(MAX_UPLOAD_BYTES + 1)))));
  });
  it("rejects binary content in a text file", async () => {
    assert.ok("error" in (await checkUpload(file("data.csv", new Uint8Array([0x61, 0x00, 0x62])))));
  });
});

describe("download disposition", () => {
  it("opens images inline, staff PDFs inline, student PDFs as downloads", () => {
    assert.equal(isInlineSafe("image/png", "student"), true);
    assert.equal(isInlineSafe("application/pdf", "instructor"), true);
    assert.equal(isInlineSafe("application/pdf", "student"), false);
    assert.equal(isInlineSafe("text/csv", "instructor"), false);
  });
});

describe("CSV export", () => {
  it("neutralises spreadsheet formulas and quotes every cell", async () => {
    const text = await csvResponse("x", [["=HYPERLINK(\"http://evil\")", "+1", "-2", "@cmd", "plain", 'say "hi"']]).text();
    assert.equal(text.replace(/^﻿/, ""), `"'=HYPERLINK(""http://evil"")","'+1","'-2","'@cmd","plain","say ""hi"""`);
  });
  it("sanitises the download filename", () => {
    const res = csvResponse("Quiz 1: Arrays/../../etc", [["a"]]);
    assert.match(res.headers.get("content-disposition") ?? "", /filename="Quiz_1_Arrays_etc\.csv"/);
  });
});

describe("course staff capabilities", () => {
  it("instructors and coordinators can do everything in their course", () => {
    for (const role of ["instructor", "coordinator"] as const)
      for (const cap of ["course.view", "course.manage", "grade.view", "grade.edit", "discussion.moderate"] as const) assert.equal(staffCan(role, cap), true);
  });
  it("teaching assistants can view, grade and moderate, but not manage the course", () => {
    assert.equal(staffCan("teaching_assistant", "grade.edit"), true);
    assert.equal(staffCan("teaching_assistant", "discussion.moderate"), true);
    assert.equal(staffCan("teaching_assistant", "course.manage"), false);
  });
  it("only coordinators manage the course staff", () => {
    assert.equal(staffCan("coordinator", "staff.manage"), true);
    assert.equal(staffCan("instructor", "staff.manage"), false);
    assert.equal(staffCan("teaching_assistant", "staff.manage"), false);
  });
  it("non-staff can do nothing (fails closed)", () => {
    assert.equal(staffCan(null, "course.view"), false);
    assert.equal(staffCan(undefined, "grade.view"), false);
  });
});

describe("attendance arithmetic (policy passed in, never assumed)", () => {
  const c = (present: number, late: number, absent: number, excused: number) => ({ present, late, absent, excused });
  it("excused classes are left out of the count", () => {
    assert.equal(attendancePercent(c(3, 0, 1, 2), 100), 75);
  });
  it("a late mark counts as the configured share of present", () => {
    assert.equal(attendancePercent(c(2, 2, 0, 0), 100), 100);
    assert.equal(attendancePercent(c(2, 2, 0, 0), 50), 75);
    assert.equal(attendancePercent(c(2, 2, 0, 0), 0), 50);
  });
  it("has no percentage before anything counts", () => {
    assert.equal(attendancePercent(c(0, 0, 0, 3), 100), null);
  });
  it("flags only when a minimum is configured", () => {
    assert.equal(belowThreshold(60, 75), true);
    assert.equal(belowThreshold(75, 75), false);
    assert.equal(belowThreshold(10, null), false);
    assert.equal(belowThreshold(null, 75), false);
  });
});
