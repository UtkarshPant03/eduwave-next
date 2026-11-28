/**
 * Grading rules, kept in one pure module so they're easy to unit-test and change.
 *
 * Policy is data (decision D4 is open): each course stores its own grade scale, total
 * method and category weights. The defaults below reproduce the pre-4.6 behaviour exactly.
 */

export type GradeBand = { letter: string; label: string; min: number; points: number };

/**
 * The default scale every course starts with (10-point scale common in Indian universities,
 * with US-style letters alongside). Courses can change theirs; this is not university policy.
 * Must match the bands inserted by drizzle/0007_gradebook.sql.
 */
export const DEFAULT_GRADE_SCALE: readonly GradeBand[] = [
  { min: 90, letter: "O", label: "Outstanding", points: 10 },
  { min: 80, letter: "A+", label: "Excellent", points: 9 },
  { min: 70, letter: "A", label: "Very good", points: 8 },
  { min: 60, letter: "B+", label: "Good", points: 7 },
  { min: 50, letter: "B", label: "Above average", points: 6 },
  { min: 45, letter: "C", label: "Average", points: 5 },
  { min: 40, letter: "P", label: "Pass", points: 4 },
  { min: 0, letter: "F", label: "Fail", points: 0 },
];

/** @deprecated use DEFAULT_GRADE_SCALE or the course's own scale. */
export const GRADE_SCALE = DEFAULT_GRADE_SCALE;

/** Bands sorted from the highest minimum down (the order letters are looked up in). */
export function sortScale(scale: readonly GradeBand[]): GradeBand[] {
  return [...scale].sort((a, b) => b.min - a.min);
}

export function letterFor(percent: number | null, scale: readonly GradeBand[] = DEFAULT_GRADE_SCALE) {
  if (percent == null || Number.isNaN(percent)) return null;
  const bands = sortScale(scale.length ? scale : DEFAULT_GRADE_SCALE);
  return bands.find((g) => percent >= g.min) ?? bands[bands.length - 1];
}

/**
 * Checks a scale before it is saved. Bands must be given from the highest minimum down
 * (strictly descending), the last one must start at 0, letters unique, points >= 0.
 * Returns a message for the first problem, or null.
 */
export function scaleProblem(bands: readonly GradeBand[]): string | null {
  if (bands.length < 1) return "Add at least one band.";
  if (bands.length > 20) return "At most 20 bands.";
  const letters = new Set<string>();
  for (const [i, b] of bands.entries()) {
    const letter = b.letter.trim();
    if (!letter) return `Band ${i + 1}: enter a letter.`;
    if (letter.length > 8) return `Band ${i + 1}: letters are at most 8 characters.`;
    if (letters.has(letter.toLowerCase())) return `The letter "${letter}" is used twice.`;
    letters.add(letter.toLowerCase());
    if (!Number.isInteger(b.min) || b.min < 0 || b.min > 100) return `Band ${i + 1}: the minimum must be a whole number from 0 to 100.`;
    if (!Number.isFinite(b.points) || b.points < 0 || b.points > 100) return `Band ${i + 1}: grade points must be between 0 and 100.`;
    if (i > 0 && b.min >= bands[i - 1].min) return `Minimums must go down strictly from band to band ("${letter}" starts at ${b.min}%, the band above at ${bands[i - 1].min}%).`;
  }
  if (bands[bands.length - 1].min !== 0) return "The lowest band must start at 0% so every percentage has a letter.";
  return null;
}

/** Assignment submission window: open until dueAt + lateDays; after dueAt it's "late". */
export function assignmentWindow(a: { dueAt: Date; lateDays: number }, now: number) {
  const closesAt = a.dueAt.getTime() + a.lateDays * 86_400_000;
  return { open: now <= closesAt, late: now > a.dueAt.getTime(), closesAt: new Date(closesAt) };
}

/**
 * One gradebook cell. `unreleased` is used only in a student's own view of an item whose
 * grades the course hasn't released: it never counts and carries no value.
 */
export type GradeCell = {
  earned: number | null;
  possible: number;
  counted: boolean;
  status: "graded" | "submitted" | "missing" | "upcoming" | "unreleased";
  /** Staff marked this value by hand (an override replaces the calculated value). */
  overridden?: boolean;
};

/**
 * Course total (points method). An item counts once it has a grade, or once its deadline
 * has passed (missing work = 0). Ungraded submissions and future items don't affect the total yet.
 */
export function courseTotal(cells: GradeCell[], scale: readonly GradeBand[] = DEFAULT_GRADE_SCALE) {
  const counted = cells.filter((c) => c.counted);
  const possible = counted.reduce((s, c) => s + c.possible, 0);
  // Rounded to 2 decimals: averaged quiz attempts can make float sums like 37.330000001.
  const earned = Math.round(counted.reduce((s, c) => s + (c.earned ?? 0), 0) * 100) / 100;
  const percent = possible > 0 ? (earned / possible) * 100 : null;
  // Rounding policy: the letter follows the whole-number percentage that is DISPLAYED
  // (half up), so a student never sees "90%" next to a grade band that starts at 90.
  return { earned, possible, percent, letter: letterFor(percent == null ? null : Math.round(percent), scale) };
}

export type TotalMethod = "points" | "weighted";
export type GradeCategory = { id: string; name: string; weight: number };
export type CategoryResult = GradeCategory & { earned: number; possible: number; percent: number | null };

/** Points earned and possible per category, over counted cells only. */
export function categoryResults(cells: (GradeCell & { categoryId: string | null })[], categories: readonly GradeCategory[]): CategoryResult[] {
  return categories.map((c) => {
    const counted = cells.filter((x) => x.counted && x.categoryId === c.id);
    const possible = counted.reduce((s, x) => s + x.possible, 0);
    const earned = Math.round(counted.reduce((s, x) => s + (x.earned ?? 0), 0) * 100) / 100;
    return { ...c, earned, possible, percent: possible > 0 ? (earned / possible) * 100 : null };
  });
}

/**
 * Weighted total: Σ(category weight × category percentage) over the categories that have
 * counted items, re-normalised over THOSE categories' weights (a category with nothing
 * counted yet doesn't pull the total down). Uncategorised cells are not part of a weighted
 * total (the server doesn't allow them in weighted mode); they are reported as `uncategorised`.
 */
export function weightedTotal(
  cells: (GradeCell & { categoryId: string | null })[],
  categories: readonly GradeCategory[],
  scale: readonly GradeBand[] = DEFAULT_GRADE_SCALE,
) {
  const byCategory = categoryResults(cells, categories);
  const used = byCategory.filter((c) => c.percent != null);
  const weights = used.reduce((s, c) => s + c.weight, 0);
  const percent = weights > 0 ? used.reduce((s, c) => s + c.weight * (c.percent ?? 0), 0) / weights : null;
  const known = new Set(categories.map((c) => c.id));
  const categorised = cells.filter((c) => c.counted && c.categoryId != null && known.has(c.categoryId));
  const possible = categorised.reduce((s, c) => s + c.possible, 0);
  const earned = Math.round(categorised.reduce((s, c) => s + (c.earned ?? 0), 0) * 100) / 100;
  return {
    earned,
    possible,
    percent,
    letter: letterFor(percent == null ? null : Math.round(percent), scale),
    categories: byCategory,
    uncategorised: cells.filter((c) => c.counted && (c.categoryId == null || !known.has(c.categoryId))).length,
  };
}

export type CourseOverride = { percent: number | null; letter: string | null };

/**
 * Applies a course-total override: a percentage replaces the calculated one (and its letter
 * follows the scale); a letter replaces the letter. Without an override nothing changes.
 */
export function applyCourseOverride<T extends { percent: number | null; letter: GradeBand | null }>(
  total: T,
  override: CourseOverride | null,
  scale: readonly GradeBand[] = DEFAULT_GRADE_SCALE,
): T & { overridden: boolean; calculatedPercent: number | null; calculatedLetter: GradeBand | null } {
  const base = { ...total, overridden: false, calculatedPercent: total.percent, calculatedLetter: total.letter };
  if (!override || (override.percent == null && override.letter == null)) return base;
  const percent = override.percent ?? total.percent;
  const fromLetter = override.letter ? (scale.find((b) => b.letter === override.letter) ?? null) : null;
  const letter = fromLetter ?? letterFor(percent == null ? null : Math.round(percent), scale);
  return { ...base, percent, letter, overridden: true };
}
