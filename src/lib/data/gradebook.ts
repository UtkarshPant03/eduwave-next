/**
 * Gradebook: a students × items matrix (assignments + quizzes) with course totals.
 */
import "server-only";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { courseTotal, type GradeCell } from "@/lib/grading";
import { courseParticipants } from "./courses";

const { assignments, quizzes, questions, submissions, attempts } = schema;

export type GradeItem = { id: string; kind: "assignment" | "quiz"; title: string; possible: number; due: Date };

export async function gradebook(courseId: string, onlyStudentId?: string) {
  const now = Date.now();
  const [asg, qz] = await Promise.all([
    db.select().from(assignments).where(eq(assignments.courseId, courseId)).orderBy(asc(assignments.dueAt)),
    db.select().from(quizzes).where(eq(quizzes.courseId, courseId)).orderBy(asc(quizzes.deadline)),
  ]);
  const qCounts = qz.length
    ? await db.select({ quizId: questions.quizId, id: questions.id }).from(questions).where(inArray(questions.quizId, qz.map((q) => q.id)))
    : [];

  const items: GradeItem[] = [
    ...asg.map((a) => ({ id: a.id, kind: "assignment" as const, title: a.title, possible: a.maxPoints, due: a.dueAt })),
    ...qz.map((q) => ({ id: q.id, kind: "quiz" as const, title: q.title, possible: qCounts.filter((c) => c.quizId === q.id).length, due: q.deadline })),
  ].sort((a, b) => a.due.getTime() - b.due.getTime());

  let students = await courseParticipants(courseId);
  if (onlyStudentId) students = students.filter((s) => s.id === onlyStudentId);
  const ids = students.map((s) => s.id);

  const [subs, atts] = await Promise.all([
    asg.length && ids.length
      ? db.select().from(submissions).where(and(inArray(submissions.assignmentId, asg.map((a) => a.id)), inArray(submissions.studentId, ids)))
      : [],
    qz.length && ids.length
      ? db
          .select()
          .from(attempts)
          .where(and(inArray(attempts.quizId, qz.map((q) => q.id)), inArray(attempts.studentId, ids), isNotNull(attempts.submittedAt)))
      : [],
  ]);

  const rows = students.map((s) => {
    const cells: Record<string, GradeCell> = {};
    for (const item of items) {
      const past = item.due.getTime() < now;
      if (item.kind === "assignment") {
        const sub = subs.find((x) => x.assignmentId === item.id && x.studentId === s.id);
        cells[item.id] = sub?.grade != null
          ? { earned: sub.grade, possible: item.possible, counted: true, status: "graded" }
          : sub
            ? { earned: null, possible: item.possible, counted: false, status: "submitted" }
            : { earned: past ? 0 : null, possible: item.possible, counted: past, status: past ? "missing" : "upcoming" };
      } else {
        const att = atts.find((x) => x.quizId === item.id && x.studentId === s.id);
        cells[item.id] = att
          ? { earned: att.score ?? 0, possible: item.possible, counted: true, status: "graded" }
          : { earned: past ? 0 : null, possible: item.possible, counted: past, status: past ? "missing" : "upcoming" };
      }
    }
    return { student: s, cells, total: courseTotal(Object.values(cells)) };
  });

  return { items, rows };
}
