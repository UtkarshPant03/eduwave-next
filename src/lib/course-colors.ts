/**
 * Course cover palettes. Each course picks one; the cover is a gradient plus a
 * subtle SVG pattern (see components/course-cover.tsx). Kept outside "use server"
 * files so both server and client code can import it.
 */
export const COURSE_COLORS = ["indigo", "teal", "violet", "amber", "rose", "sky", "emerald", "slate"] as const;
export type CourseColor = (typeof COURSE_COLORS)[number];

export const COVER: Record<CourseColor, { from: string; to: string; accent: string }> = {
  indigo: { from: "#3b4fd8", to: "#6d5ce8", accent: "#c7d0ff" },
  teal: { from: "#0f766e", to: "#14b8a6", accent: "#b5f5ec" },
  violet: { from: "#6d28d9", to: "#a855f7", accent: "#e9d5ff" },
  amber: { from: "#b45309", to: "#f59e0b", accent: "#fde68a" },
  rose: { from: "#be123c", to: "#f43f5e", accent: "#fecdd3" },
  sky: { from: "#0369a1", to: "#38bdf8", accent: "#bae6fd" },
  emerald: { from: "#047857", to: "#10b981", accent: "#a7f3d0" },
  slate: { from: "#1e293b", to: "#475569", accent: "#cbd5e1" },
};

export const coverFor = (color: string) => COVER[(COURSE_COLORS as readonly string[]).includes(color) ? (color as CourseColor) : "indigo"];
