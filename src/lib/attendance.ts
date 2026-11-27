/**
 * Attendance arithmetic: pure functions, unit-tested (tests/unit/logic.test.ts).
 *
 * Policy is passed in, never assumed: how much a "late" counts (lateCreditPercent) and
 * the minimum percentage (thresholdPercent, possibly none) are per-course settings,
 * because the university's rules (D3 in docs/IMPLEMENTATION_ROADMAP.md) aren't encoded here.
 */
export type AttendanceStatus = "present" | "absent" | "late" | "excused";
export type AttendanceCounts = Record<AttendanceStatus, number>;

export const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = ["present", "late", "absent", "excused"];
export const STATUS_LABEL: Record<AttendanceStatus, string> = { present: "Present", late: "Late", absent: "Absent", excused: "Excused" };

/**
 * Percentage attended. Excused sessions are left out of the count entirely; a late mark
 * counts as `lateCreditPercent`% of a present one. Null when nothing counts yet.
 */
export function attendancePercent(c: AttendanceCounts, lateCreditPercent: number): number | null {
  const counted = c.present + c.late + c.absent;
  if (counted === 0) return null;
  return ((c.present + (c.late * lateCreditPercent) / 100) / counted) * 100;
}

/** Below the configured minimum? Always false when no threshold is configured. */
export function belowThreshold(percent: number | null, thresholdPercent: number | null): boolean {
  return thresholdPercent != null && percent != null && percent < thresholdPercent;
}

export const emptyCounts = (): AttendanceCounts => ({ present: 0, absent: 0, late: 0, excused: 0 });
