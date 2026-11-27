/**
 * Grading rules, kept in one pure module so they're easy to unit-test and change.
 */

/** 10-point scale common in Indian universities, with US-style letters alongside. */
export const GRADE_SCALE = [
  { min: 90, letter: "O", label: "Outstanding", points: 10 },
  { min: 80, letter: "A+", label: "Excellent", points: 9 },
  { min: 70, letter: "A", label: "Very good", points: 8 },
  { min: 60, letter: "B+", label: "Good", points: 7 },
  { min: 50, letter: "B", label: "Above average", points: 6 },
  { min: 45, letter: "C", label: "Average", points: 5 },
  { min: 40, letter: "P", label: "Pass", points: 4 },
  { min: 0, letter: "F", label: "Fail", points: 0 },
] as const;

export function letterFor(percent: number | null) {
  if (percent == null || Number.isNaN(percent)) return null;
  return GRADE_SCALE.find((g) => percent >= g.min) ?? GRADE_SCALE[GRADE_SCALE.length - 1];
}

/** Assignment submission window: open until dueAt + lateDays; after dueAt it's "late". */
export function assignmentWindow(a: { dueAt: Date; lateDays: number }, now: number) {
  const closesAt = a.dueAt.getTime() + a.lateDays * 86_400_000;
  return { open: now <= closesAt, late: now > a.dueAt.getTime(), closesAt: new Date(closesAt) };
}

export type GradeCell = { earned: number | null; possible: number; counted: boolean; status: "graded" | "submitted" | "missing" | "upcoming" };

/**
 * Course total. An item counts once it has a grade, or once its deadline has passed
 * (missing work = 0). Ungraded submissions and future items don't affect the total yet.
 */
export function courseTotal(cells: GradeCell[]) {
  const counted = cells.filter((c) => c.counted);
  const possible = counted.reduce((s, c) => s + c.possible, 0);
  const earned = counted.reduce((s, c) => s + (c.earned ?? 0), 0);
  const percent = possible > 0 ? (earned / possible) * 100 : null;
  // Rounding policy: the letter follows the whole-number percentage that is DISPLAYED
  // (half up), so a student never sees "90%" next to a grade band that starts at 90.
  return { earned, possible, percent, letter: letterFor(percent == null ? null : Math.round(percent)) };
}
