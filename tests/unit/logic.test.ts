/**
 * Unit tests for pure academic and security logic (Node's built-in test runner, no
 * extra dependency). Run: npm run test:unit
 *
 * These pin down rules that the browser suites only exercise indirectly: grade bands
 * and rounding, submission windows, quiz timing and shuffling, upload validation, CSV
 * formula escaping, download disposition, attendance arithmetic, and (4.4) question types,
 * answer checking, attempt grading methods and random-slot picks.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignmentWindow, courseTotal, letterFor } from "../../src/lib/grading";
import { attemptEndsAt, buildLayout, GRACE_MS, isAttemptOpen } from "../../src/lib/quiz-engine";
import { checkUpload, isInlineSafe, MAX_UPLOAD_BYTES } from "../../src/lib/uploads";
import { csvResponse } from "../../src/lib/csv";
import { staffCan } from "../../src/lib/auth/capabilities";
import { attendancePercent, belowThreshold } from "../../src/lib/attendance";
import { answerSummary, gradedResult, isCorrect, normalizeShortAnswer, parseTags, questionInput, scoreAttempt, type AnswerKey, type Response } from "../../src/lib/questions";
import { chooseQuestions, givenQuestionIds } from "../../src/lib/quiz-engine";

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

/* ------------------- 4.4: question types, grading methods, random picks ------------------- */

const noAnswer: Response = { selectedIndex: null, selectedIndexes: null, textAnswer: null, numberAnswer: null };
const answerKey = (k: Partial<AnswerKey> & Pick<AnswerKey, "type">): AnswerKey => ({ correctIndex: null, correctIndexes: null, acceptedAnswers: null, numericAnswer: null, tolerance: null, ...k });

describe("answer checking edge cases (spec 1, criterion 4)", () => {
  it("single choice / true-false: no answer is wrong, never an error", () => {
    assert.equal(isCorrect(answerKey({ type: "true_false", correctIndex: 0 }), noAnswer), false);
    assert.equal(isCorrect(answerKey({ type: "single", correctIndex: 0 }), null), false);
  });
  it("multiple answer: order and repeats in the selection don't matter, extras do", () => {
    const q = answerKey({ type: "multiple", correctIndexes: [3, 1] });
    assert.equal(isCorrect(q, { ...noAnswer, selectedIndexes: [1, 3, 3, 1] }), true);
    assert.equal(isCorrect(q, { ...noAnswer, selectedIndexes: [1, 3, 5] }), false);
    assert.equal(isCorrect(q, { ...noAnswer, selectedIndexes: null }), false);
    assert.equal(isCorrect(answerKey({ type: "multiple", correctIndexes: [] }), { ...noAnswer, selectedIndexes: [] }), false, "an empty key never matches");
  });
  it("short answer: tabs/newlines collapse, case and outer spaces ignored, otherwise exact", () => {
    const q = answerKey({ type: "short_answer", acceptedAnswers: ["Depth  first search"] });
    assert.equal(isCorrect(q, { ...noAnswer, textAnswer: "\tdepth\nFIRST   search  " }), true);
    assert.equal(isCorrect(q, { ...noAnswer, textAnswer: "depth-first search" }), false, "punctuation is not ignored");
    assert.equal(isCorrect(q, { ...noAnswer, textAnswer: "depth first" }), false, "no partial match");
    assert.equal(isCorrect(answerKey({ type: "short_answer", acceptedAnswers: [] }), { ...noAnswer, textAnswer: "" }), false);
  });
  it("short answer: composed and decomposed accents are the same answer (NFC)", () => {
    assert.equal(normalizeShortAnswer("Café"), normalizeShortAnswer("Café"));
    assert.equal(isCorrect(answerKey({ type: "short_answer", acceptedAnswers: ["Café"] }), { ...noAnswer, textAnswer: "café" }), true);
  });
  it("numerical: inclusive tolerance on both sides, negatives, no tolerance = exact", () => {
    const q = answerKey({ type: "numerical", numericAnswer: -2.5, tolerance: 0.5 });
    assert.equal(isCorrect(q, { ...noAnswer, numberAnswer: -3 }), true);
    assert.equal(isCorrect(q, { ...noAnswer, numberAnswer: -2 }), true);
    assert.equal(isCorrect(q, { ...noAnswer, numberAnswer: -1.99 }), false);
    assert.equal(isCorrect(q, { ...noAnswer, numberAnswer: -3.01 }), false);
    const exact = answerKey({ type: "numerical", numericAnswer: 10, tolerance: null });
    assert.equal(isCorrect(exact, { ...noAnswer, numberAnswer: 10 }), true);
    assert.equal(isCorrect(exact, { ...noAnswer, numberAnswer: 10.001 }), false);
    assert.equal(isCorrect(exact, { ...noAnswer, numberAnswer: Number.POSITIVE_INFINITY }), false);
    assert.equal(isCorrect(exact, { ...noAnswer, numberAnswer: null }), false);
  });
});

describe("attempt score = sum of points (criterion 5)", () => {
  it("counts only the questions the attempt was given, each with its own points", () => {
    const given = [
      { id: "a", points: 2, ...answerKey({ type: "true_false", correctIndex: 1 }) },
      { id: "b", points: 5, ...answerKey({ type: "short_answer", acceptedAnswers: ["heap"] }) },
    ];
    const answers = new Map<string, Response>([
      ["a", { ...noAnswer, selectedIndex: 1 }],
      ["b", { ...noAnswer, textAnswer: " HEAP " }],
      ["not-given", { ...noAnswer, selectedIndex: 0 }],
    ]);
    assert.equal(scoreAttempt(given, answers), 7);
    assert.equal(scoreAttempt(given, new Map()), 0);
  });
});

describe("grading methods (criterion 8)", () => {
  it("first / last follow the attempt number, not the order given", () => {
    const a = [{ attemptNumber: 3, score: 9, total: 10 }, { attemptNumber: 1, score: 2, total: 10 }, { attemptNumber: 2, score: 5, total: 10 }];
    assert.deepEqual(gradedResult(a, "first"), { score: 2, total: 10 });
    assert.deepEqual(gradedResult(a, "last"), { score: 9, total: 10 });
  });
  it("average is rounded to 2 decimals; highest picks the best attempt", () => {
    const a = [{ attemptNumber: 1, score: 1, total: 3 }, { attemptNumber: 2, score: 2, total: 3 }, { attemptNumber: 3, score: 2, total: 3 }];
    assert.deepEqual(gradedResult(a, "average"), { score: 1.67, total: 3 });
    assert.deepEqual(gradedResult(a, "highest"), { score: 2, total: 3 });
  });
  it("one attempt gives the same value under every method (the pre-4.4 behaviour)", () => {
    for (const m of ["highest", "average", "first", "last"] as const) assert.deepEqual(gradedResult([{ attemptNumber: 1, score: 4, total: 6 }], m), { score: 4, total: 6 });
  });
  it("the browser suite's example: 11 then 7 of 11 → average 9", () => {
    assert.deepEqual(gradedResult([{ attemptNumber: 1, score: 11, total: 11 }, { attemptNumber: 2, score: 7, total: 11 }], "average"), { score: 9, total: 11 });
  });
});

describe("question validation (criteria 4 and 5)", () => {
  it("refuses a correct option that doesn't exist", () => {
    assert.equal(questionInput.safeParse({ type: "single", prompt: "x", options: ["a", "b"], correctIndex: 2 }).success, false);
    assert.equal(questionInput.safeParse({ type: "multiple", prompt: "x", options: ["a", "b"], correctIndexes: [0, 2] }).success, false);
    assert.equal(questionInput.safeParse({ type: "true_false", prompt: "x", correctIndex: 2 }).success, false);
    assert.equal(questionInput.safeParse({ type: "single", prompt: "x", options: ["a"], correctIndex: 0 }).success, false, "needs 2 options");
  });
  it("points: positive whole numbers, default 1, at most 100", () => {
    assert.equal(questionInput.parse({ type: "true_false", prompt: "x", correctIndex: 1 }).points, 1);
    assert.equal(questionInput.safeParse({ type: "true_false", prompt: "x", correctIndex: 1, points: -1 }).success, false);
    assert.equal(questionInput.safeParse({ type: "true_false", prompt: "x", correctIndex: 1, points: 101 }).success, false);
    assert.equal(questionInput.parse({ type: "true_false", prompt: "x", correctIndex: 1, points: 7 }).points, 7);
  });
  it("normalises the stored key: sorted unique correct options, collapsed accepted answers, tolerance 0", () => {
    const m = questionInput.parse({ type: "multiple", prompt: "x", options: ["a", "b", "c"], correctIndexes: [2, 0, 2] });
    assert.deepEqual(m.correctIndexes, [0, 2]);
    assert.equal(m.correctIndex, null);
    const sa = questionInput.parse({ type: "short_answer", prompt: "x", acceptedAnswers: ["Binary   Heap", "binary heap", " min-heap "] });
    assert.deepEqual(sa.acceptedAnswers, ["Binary Heap", "min-heap"]);
    const n = questionInput.parse({ type: "numerical", prompt: "x", numericAnswer: 3 });
    assert.equal(n.tolerance, 0);
    assert.deepEqual(n.options, []);
  });
  it("tags: at most 10, each at most 40 characters", () => {
    const many = Array.from({ length: 15 }, (_, i) => `t${i}`).join(",");
    assert.equal(parseTags(many).length, 10);
    assert.equal(parseTags("x".repeat(60))[0].length, 40);
    assert.deepEqual(parseTags(""), []);
  });
  it("staff answer summaries per type", () => {
    const base = { options: [] as string[], correctIndex: null, correctIndexes: null, acceptedAnswers: null, numericAnswer: null, tolerance: null };
    assert.equal(answerSummary({ ...base, type: "single", options: ["a", "b"], correctIndex: 1 }), "b");
    assert.equal(answerSummary({ ...base, type: "multiple", options: ["a", "b", "c"], correctIndexes: [0, 2] }), "a + c");
    assert.equal(answerSummary({ ...base, type: "short_answer", acceptedAnswers: ["x", "y"] }), "x | y");
    assert.equal(answerSummary({ ...base, type: "numerical", numericAnswer: 9.81, tolerance: 0.05 }), "9.81 ± 0.05");
  });
});

describe("random slots (criterion 6)", () => {
  const pool = (slot: string, n: number, position: number) => Array.from({ length: n }, (_, i) => ({ id: `${slot}${i}`, position, slotId: slot as string | null }));
  it("two slots and fixed questions keep the quiz order; picks come from their own pool", () => {
    const qs = [{ id: "f0", position: 0, slotId: null }, ...pool("A", 5, 1), { id: "f2", position: 2, slotId: null }, ...pool("B", 3, 3)];
    const given = chooseQuestions(qs, [{ id: "A", position: 1, pickCount: 2 }, { id: "B", position: 3, pickCount: 3 }]).map((q) => q.id);
    assert.equal(given.length, 7);
    assert.equal(given[0], "f0");
    assert.ok(given.slice(1, 3).every((id) => id.startsWith("A")));
    assert.equal(given[3], "f2");
    assert.deepEqual(given.slice(4).sort(), ["B0", "B1", "B2"]);
  });
  it("prefers the least-used questions deterministically", () => {
    const qs = pool("A", 4, 0);
    const usage = new Map([["A0", 3], ["A1", 0], ["A2", 2], ["A3", 1]]);
    for (let i = 0; i < 10; i++) assert.deepEqual(chooseQuestions(qs, [{ id: "A", position: 0, pickCount: 2 }], usage).map((q) => q.id).sort(), ["A1", "A3"]);
  });
  it("four starts on a pool of 4 with 1 pick each give 4 different questions", () => {
    const qs = pool("A", 4, 0);
    const usage = new Map<string, number>();
    const seenIds = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const [q] = chooseQuestions(qs, [{ id: "A", position: 0, pickCount: 1 }], usage);
      seenIds.add(q.id);
      usage.set(q.id, (usage.get(q.id) ?? 0) + 1);
    }
    assert.equal(seenIds.size, 4);
  });
  it("an attempt's layout decides which questions count", () => {
    assert.deepEqual(givenQuestionIds({ questionOrder: ["A2", "f0"], optionOrders: {} }, [{ id: "f0", slotId: null }, { id: "A2", slotId: "A" }]), ["A2", "f0"]);
  });
});
