/**
 * Unit tests for the 4.6 gradebook rules (pure functions in src/lib/grading.ts):
 * weighted totals with re-normalisation, scales as data, scale validation, course-total
 * overrides, and that the default path is identical to the pre-4.6 calculation.
 * Run: npm run test:unit
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCourseOverride,
  courseTotal,
  DEFAULT_GRADE_SCALE,
  letterFor,
  scaleProblem,
  weightedTotal,
  type GradeBand,
  type GradeCell,
} from "../../src/lib/grading";

/** The pre-4.6 implementation, copied verbatim as the reference for "nothing changes". */
const OLD_SCALE = [
  { min: 90, letter: "O", points: 10 },
  { min: 80, letter: "A+", points: 9 },
  { min: 70, letter: "A", points: 8 },
  { min: 60, letter: "B+", points: 7 },
  { min: 50, letter: "B", points: 6 },
  { min: 45, letter: "C", points: 5 },
  { min: 40, letter: "P", points: 4 },
  { min: 0, letter: "F", points: 0 },
];
function oldLetter(percent: number | null) {
  if (percent == null || Number.isNaN(percent)) return null;
  return OLD_SCALE.find((g) => percent >= g.min) ?? OLD_SCALE[OLD_SCALE.length - 1];
}
function oldTotal(cells: GradeCell[]) {
  const counted = cells.filter((c) => c.counted);
  const possible = counted.reduce((s, c) => s + c.possible, 0);
  const earned = Math.round(counted.reduce((s, c) => s + (c.earned ?? 0), 0) * 100) / 100;
  const percent = possible > 0 ? (earned / possible) * 100 : null;
  return { earned, possible, percent, letter: oldLetter(percent == null ? null : Math.round(percent)) };
}

const graded = (earned: number, possible: number, categoryId: string | null = null) => ({ earned, possible, counted: true, status: "graded" as const, categoryId });
const upcoming = (possible: number, categoryId: string | null = null) => ({ earned: null, possible, counted: false, status: "upcoming" as const, categoryId });

describe("default path equals the pre-4.6 calculation", () => {
  it("same earned, possible, percent, letter and grade points on many random gradebooks", () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let n = 0; n < 2000; n++) {
      const cells: GradeCell[] = Array.from({ length: 1 + Math.floor(rand() * 8) }, () => {
        const possible = 1 + Math.floor(rand() * 50);
        const r = rand();
        return r < 0.6
          ? { earned: Math.round(rand() * possible * 100) / 100, possible, counted: true, status: "graded" as const }
          : r < 0.75
            ? { earned: 0, possible, counted: true, status: "missing" as const }
            : { earned: null, possible, counted: false, status: r < 0.9 ? ("submitted" as const) : ("upcoming" as const) };
      });
      const before = oldTotal(cells);
      const after = applyCourseOverride(courseTotal(cells, DEFAULT_GRADE_SCALE), null, DEFAULT_GRADE_SCALE);
      assert.deepEqual([after.earned, after.possible, after.percent], [before.earned, before.possible, before.percent]);
      assert.equal(after.letter?.letter ?? null, before.letter?.letter ?? null);
      assert.equal(after.letter?.points ?? null, before.letter?.points ?? null);
      assert.equal(after.overridden, false);
    }
  });
  it("every whole percentage maps to the same letter as before", () => {
    for (let p = 0; p <= 100; p++) assert.equal(letterFor(p)?.letter, oldLetter(p)?.letter);
  });
});

describe("weighted total", () => {
  const cats = [
    { id: "labs", name: "Labs", weight: 60 },
    { id: "quiz", name: "Quizzes", weight: 40 },
  ];
  it("weights each category's percentage", () => {
    const t = weightedTotal([graded(18, 20, "labs"), graded(2, 5, "quiz")], cats);
    // 0.6 × 90% + 0.4 × 40% = 70%
    assert.equal(Math.round(t.percent! * 1000) / 1000, 70);
    assert.equal(t.letter?.letter, "A");
    assert.equal(t.categories.find((c) => c.id === "labs")?.percent, 90);
  });
  it("re-normalises over categories that have counted items", () => {
    const t = weightedTotal([graded(18, 20, "labs"), upcoming(5, "quiz")], cats);
    assert.equal(t.percent, 90);
    assert.equal(t.categories.find((c) => c.id === "quiz")?.percent, null);
  });
  it("has no percent or letter before anything counts", () => {
    const t = weightedTotal([upcoming(20, "labs")], cats);
    assert.equal(t.percent, null);
    assert.equal(t.letter, null);
  });
  it("reports uncategorised counted items instead of counting them", () => {
    const t = weightedTotal([graded(10, 10, "labs"), graded(0, 10, null)], cats);
    assert.equal(t.percent, 100);
    assert.equal(t.uncategorised, 1);
  });
  it("missing work counts as 0 inside its category", () => {
    const t = weightedTotal([graded(20, 20, "labs"), { earned: 0, possible: 20, counted: true, status: "missing", categoryId: "labs" }], cats);
    assert.equal(t.percent, 50);
  });
});

describe("grade scale as data", () => {
  const passFail: GradeBand[] = [
    { letter: "S", label: "Satisfactory", min: 50, points: 1 },
    { letter: "U", label: "Unsatisfactory", min: 0, points: 0 },
  ];
  it("letters follow the course's own scale", () => {
    assert.equal(letterFor(50, passFail)?.letter, "S");
    assert.equal(letterFor(49.9, passFail)?.letter, "U");
    assert.equal(courseTotal([graded(5, 10)], passFail).letter?.letter, "S");
  });
  it("accepts the default scale", () => assert.equal(scaleProblem(DEFAULT_GRADE_SCALE), null));
  it("refuses minimums that don't go down strictly", () => assert.match(scaleProblem([{ letter: "A", label: "", min: 50, points: 1 }, { letter: "B", label: "", min: 50, points: 0 }, { letter: "F", label: "", min: 0, points: 0 }]) ?? "", /strictly/));
  it("refuses a scale without a band at 0", () => assert.match(scaleProblem([{ letter: "A", label: "", min: 50, points: 1 }]) ?? "", /0%/));
  it("refuses duplicate letters and negative points", () => {
    assert.match(scaleProblem([{ letter: "A", label: "", min: 50, points: 1 }, { letter: "a", label: "", min: 0, points: 0 }]) ?? "", /twice/);
    assert.match(scaleProblem([{ letter: "A", label: "", min: 0, points: -1 }]) ?? "", /points/);
  });
});

describe("course-total override", () => {
  const total = courseTotal([graded(30, 100)]);
  it("a percentage replaces the total and its letter follows the scale", () => {
    const t = applyCourseOverride(total, { percent: 85, letter: null });
    assert.equal(t.percent, 85);
    assert.equal(t.letter?.letter, "A+");
    assert.equal(t.overridden, true);
    assert.equal(t.calculatedPercent, 30);
  });
  it("a letter replaces only the letter", () => {
    const t = applyCourseOverride(total, { percent: null, letter: "P" });
    assert.equal(t.percent, 30);
    assert.equal(t.letter?.letter, "P");
    assert.equal(t.letter?.points, 4);
  });
  it("a removed override (no values) changes nothing", () => {
    const t = applyCourseOverride(total, { percent: null, letter: null });
    assert.equal(t.overridden, false);
    assert.equal(t.letter?.letter, "F");
  });
});
