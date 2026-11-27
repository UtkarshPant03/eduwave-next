/**
 * Gradebook: a students × items matrix (assignments + quizzes) with course totals.
 */
import "server-only";
import { and, asc, count, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { courseTotal, type GradeCell } from "@/lib/grading";
import { finalizeExpiredAttempts } from "@/lib/quiz-engine";
import { courseParticipants } from "./courses";

const { assignments, quizzes, questions, submissions, attempts } = schema;

/**
 * `due` is shown to users; `closes` is when missing work starts counting as 0
 * (for assignments: the due date plus the late window).
 */
export type GradeItem = { id: string; kind: "assignment" | "quiz"; title: string; possible: number; due: Date; closes: Date };

const DAY = 86_400_000;

export async function gradebook(courseId: string, onlyStudentId?: string) {
  // Abandoned quiz attempts must count with the score they earned, not as "missing".
  await finalizeExpiredAttempts(onlyStudentId ? { studentId: onlyStudentId } : { courseId });
  const now = Date.now();
  const [asg, qz, qCounts, students] = await Promise.all([
    // Only the columns needed (instructions can be 20 KB each).
    db
      .select({ id: assignments.id, title: assignments.title, maxPoints: assignments.maxPoints, dueAt: assignments.dueAt, lateDays: assignments.lateDays })
      .from(assignments)
      .where(eq(assignments.courseId, courseId))
      .orderBy(asc(assignments.dueAt)),
    db.select({ id: quizzes.id, title: quizzes.title, deadline: quizzes.deadline }).from(quizzes).where(eq(quizzes.courseId, courseId)),
    // Points possible per quiz = number of questions, counted in SQL.
    db
      .select({ quizId: questions.quizId, n: count() })
      .from(questions)
      .innerJoin(quizzes, eq(quizzes.id, questions.quizId))
      .where(eq(quizzes.courseId, courseId))
      .groupBy(questions.quizId),
    courseParticipants(courseId, onlyStudentId),
  ]);
  const questionCount = new Map(qCounts.map((r) => [r.quizId, Number(r.n)]));

  const items: GradeItem[] = [
    ...asg.map((a) => ({
      id: a.id,
      kind: "assignment" as const,
      title: a.title,
      possible: a.maxPoints,
      due: a.dueAt,
      closes: new Date(a.dueAt.getTime() + a.lateDays * DAY),
    })),
    ...qz.map((q) => ({ id: q.id, kind: "quiz" as const, title: q.title, possible: questionCount.get(q.id) ?? 0, due: q.deadline, closes: q.deadline })),
  ].sort((a, b) => a.due.getTime() - b.due.getTime());

  const ids = students.map((s) => s.id);
  const [subs, atts] = await Promise.all([
    asg.length && ids.length
      ? db
          .select({ assignmentId: submissions.assignmentId, studentId: submissions.studentId, grade: submissions.grade })
          .from(submissions)
          .where(and(inArray(submissions.assignmentId, asg.map((a) => a.id)), inArray(submissions.studentId, ids)))
      : [],
    qz.length && ids.length
      ? db
          .select({ quizId: attempts.quizId, studentId: attempts.studentId, score: attempts.score })
          .from(attempts)
          .where(and(inArray(attempts.quizId, qz.map((q) => q.id)), inArray(attempts.studentId, ids), isNotNull(attempts.submittedAt)))
      : [],
  ]);
  // O(1) lookups instead of scanning every submission for every cell.
  const subBy = new Map(subs.map((x) => [`${x.assignmentId}:${x.studentId}`, x]));
  const attBy = new Map(atts.map((x) => [`${x.quizId}:${x.studentId}`, x]));

  const rows = students.map((s) => {
    const cells: Record<string, GradeCell> = {};
    for (const item of items) {
      const closed = item.closes.getTime() < now;
      const missing: GradeCell = { earned: closed ? 0 : null, possible: item.possible, counted: closed, status: closed ? "missing" : "upcoming" };
      if (item.kind === "assignment") {
        const sub = subBy.get(`${item.id}:${s.id}`);
        cells[item.id] = sub?.grade != null
          ? { earned: sub.grade, possible: item.possible, counted: true, status: "graded" }
          : sub
            ? { earned: null, possible: item.possible, counted: false, status: "submitted" }
            : missing;
      } else {
        const att = attBy.get(`${item.id}:${s.id}`);
        cells[item.id] = att ? { earned: att.score ?? 0, possible: item.possible, counted: true, status: "graded" } : missing;
      }
    }
    return { student: s, cells, total: courseTotal(Object.values(cells)) };
  });

  return { items, rows };
}
