/**
 * Database integrity tests: each check tries to break an academic-data rule directly
 * against the database (bypassing the app) and expects the database itself to refuse.
 * Also tests that quiz finalisation and a concurrent answer save can't interleave.
 *
 * Runs against whatever the app would use: DATABASE_URL (PostgreSQL) or PGLITE_DIR.
 * Use a THROWAWAY, migrated database: it inserts its own fixtures.
 *
 *   PGLITE_DIR=./.pglite-test npm run db:migrate && PGLITE_DIR=./.pglite-test npm run test:db
 *   DATABASE_URL=postgres://... npm run test:db
 */
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import { finalizeAttempt } from "../src/lib/quiz-engine";

const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};
/** Runs `fn` in a transaction that is always rolled back; returns the error, if any. */
async function rejected(fn: (tx: typeof db) => Promise<unknown>): Promise<string | null> {
  try {
    await db.transaction(async (tx) => {
      await fn(tx as unknown as typeof db);
      throw new Error("__no_error__");
    });
  } catch (err) {
    const msg = String((err as { cause?: { message?: string } }).cause?.message ?? (err as Error).message);
    return msg === "__no_error__" ? null : msg;
  }
  return null;
}
const expectReject = async (name: string, fn: (tx: typeof db) => Promise<unknown>, pattern: RegExp) => {
  const err = await rejected(fn);
  check(name, err !== null && pattern.test(err), err ?? "was ACCEPTED");
};

async function main() {
  const tag = randomUUID().slice(0, 8);
  // ---- fixtures -------------------------------------------------------------
  const [instructor, student] = await db
    .insert(schema.users)
    .values([
      { role: "instructor", name: "T Instructor", email: `ins-${tag}@test.local`, passwordHash: "x" },
      { role: "student", name: "T Student", email: `stu-${tag}@test.local`, studentId: `T${tag}`.toUpperCase(), passwordHash: "x" },
    ])
    .returning();
  const [courseA, courseB] = await db
    .insert(schema.courses)
    .values([
      { code: `A${tag}`, title: "A", department: "D", term: "T", instructorId: instructor.id },
      { code: `B${tag}`, title: "B", department: "D", term: "T", instructorId: instructor.id },
    ])
    .returning();
  const [secA] = await db.insert(schema.sections).values({ courseId: courseA.id, position: 0, title: "W1" }).returning();
  const [secB] = await db.insert(schema.sections).values({ courseId: courseB.id, position: 0, title: "W1" }).returning();
  const [asg] = await db
    .insert(schema.assignments)
    .values({ courseId: courseA.id, sectionId: secA.id, title: "Lab", instructions: "x", dueAt: new Date(Date.now() + 86_400_000), maxPoints: 10 })
    .returning();
  const [sub] = await db.insert(schema.submissions).values({ assignmentId: asg.id, studentId: student.id, text: "work" }).returning();
  const [quiz1, quiz2] = await db
    .insert(schema.quizzes)
    .values([
      { courseId: courseA.id, title: "Q1", timeLimitMinutes: 10, deadline: new Date(Date.now() + 86_400_000) },
      { courseId: courseA.id, title: "Q2", timeLimitMinutes: 10, deadline: new Date(Date.now() + 86_400_000) },
    ])
    .returning();
  const [q1a, q1b] = await db
    .insert(schema.questions)
    .values([
      { quizId: quiz1.id, position: 0, prompt: "1+1", options: ["2", "3"], correctIndex: 0 },
      { quizId: quiz1.id, position: 1, prompt: "2+2", options: ["4", "5"], correctIndex: 0 },
    ])
    .returning();
  const [q2a] = await db.insert(schema.questions).values({ quizId: quiz2.id, position: 0, prompt: "x", options: ["a", "b"], correctIndex: 1 }).returning();

  // ---- cross-entity integrity ------------------------------------------------
  await expectReject(
    "assignment can't use a section of ANOTHER course",
    (tx) => tx.insert(schema.assignments).values({ courseId: courseA.id, sectionId: secB.id, title: "x", instructions: "x", dueAt: new Date() }),
    /foreign key|same_course/i,
  );
  const [attempt] = await db.insert(schema.attempts).values({ quizId: quiz1.id, studentId: student.id, total: 2 }).returning();
  await expectReject(
    "answer can't point at a question of ANOTHER quiz",
    (tx) => tx.insert(schema.answers).values({ attemptId: attempt.id, quizId: quiz1.id, questionId: q2a.id, selectedIndex: 0 }),
    /foreign key|same_quiz/i,
  );
  await expectReject(
    "answer's quiz must match its attempt's quiz",
    (tx) => tx.insert(schema.answers).values({ attemptId: attempt.id, quizId: quiz2.id, questionId: q2a.id, selectedIndex: 0 }),
    /foreign key|same_quiz/i,
  );
  await expectReject(
    "resource needs exactly one of url / file",
    (tx) => tx.insert(schema.resources).values({ courseId: courseA.id, title: "x" }),
    /check|url_xor_file/i,
  );

  // ---- value ranges ------------------------------------------------------------
  await expectReject("negative grade refused", (tx) => tx.update(schema.submissions).set({ grade: -1 }).where(eq(schema.submissions.id, sub.id)), /check|grade/i);
  await expectReject("grade above max points refused", (tx) => tx.update(schema.submissions).set({ grade: 11 }).where(eq(schema.submissions.id, sub.id)), /exceeds/i);
  await expectReject(
    "question with an out-of-range correct answer refused",
    (tx) => tx.insert(schema.questions).values({ quizId: quiz2.id, position: 1, prompt: "x", options: ["a", "b"], correctIndex: 2 }),
    /check|options/i,
  );
  await expectReject(
    "finished attempt without a score refused",
    (tx) => tx.update(schema.attempts).set({ submittedAt: new Date() }).where(eq(schema.attempts.id, attempt.id)),
    /check|finished/i,
  );

  // ---- grades ------------------------------------------------------------------
  await db.update(schema.submissions).set({ grade: 8 }).where(eq(schema.submissions.id, sub.id));
  await expectReject(
    "max points can't drop below an awarded grade",
    (tx) => tx.update(schema.assignments).set({ maxPoints: 5 }).where(eq(schema.assignments.id, asg.id)),
    /below a grade/i,
  );
  await expectReject("assignment with submissions can't be deleted", (tx) => tx.delete(schema.assignments).where(eq(schema.assignments.id, asg.id)), /foreign key|violates/i);

  // ---- quiz lifecycle ------------------------------------------------------------
  await expectReject(
    "questions frozen once a student has started",
    (tx) => tx.update(schema.questions).set({ correctIndex: 1 }).where(eq(schema.questions.id, q1a.id)),
    /cannot change after students/i,
  );
  await expectReject("quiz with attempts can't be deleted", (tx) => tx.delete(schema.quizzes).where(eq(schema.quizzes.id, quiz1.id)), /foreign key|violates|cannot change/i);

  // Concurrency: an answer save holding the attempt lock vs finalisation.
  // The save inserts a CORRECT answer and commits after a delay; finalizeAttempt must wait
  // for it (same row lock) and count it. Without locking, the score would be 0 or 1.
  await db.insert(schema.answers).values({ attemptId: attempt.id, quizId: quiz1.id, questionId: q1a.id, selectedIndex: 0 });
  const slowSave = db.transaction(async (tx) => {
    await tx.select({ id: schema.attempts.id }).from(schema.attempts).where(eq(schema.attempts.id, attempt.id)).for("update");
    await tx.execute(sql`select pg_sleep(0.5)`);
    await tx.insert(schema.answers).values({ attemptId: attempt.id, quizId: quiz1.id, questionId: q1b.id, selectedIndex: 0 });
  });
  await new Promise((r) => setTimeout(r, 100)); // let the save take the lock first
  await Promise.all([slowSave, finalizeAttempt(attempt.id), finalizeAttempt(attempt.id)]);
  const [done] = await db.select().from(schema.attempts).where(eq(schema.attempts.id, attempt.id));
  check("finalisation waits for an in-flight answer and scores it (2/2)", done.score === 2 && done.submittedAt !== null, `score ${done.score}`);
  await expectReject(
    "answers frozen once the attempt is scored",
    (tx) => tx.update(schema.answers).set({ selectedIndex: 1 }).where(eq(schema.answers.attemptId, attempt.id)),
    /cannot change/i,
  );
  await expectReject(
    "second attempt for the same quiz refused",
    (tx) => tx.insert(schema.attempts).values({ quizId: quiz1.id, studentId: student.id, total: 2 }),
    /unique|duplicate/i,
  );

  // ---- completion ticks (migration 0002) ---------------------------------------------
  const [resA] = await db.insert(schema.resources).values({ courseId: courseA.id, title: "Notes", url: "https://example.edu/notes" }).returning();
  await expectReject(
    "completion tick can't name another course's item",
    (tx) => tx.insert(schema.completions).values({ userId: student.id, itemId: resA.id, courseId: courseB.id }),
    /not a resource or live session/i,
  );
  await expectReject(
    "completion tick can't name a non-existent item",
    (tx) => tx.insert(schema.completions).values({ userId: student.id, itemId: randomUUID(), courseId: courseA.id }),
    /not a resource or live session/i,
  );
  await db.insert(schema.completions).values({ userId: student.id, itemId: resA.id, courseId: courseA.id });
  await db.delete(schema.resources).where(eq(schema.resources.id, resA.id));
  const ghosts = await db.$count(schema.completions, eq(schema.completions.itemId, resA.id));
  check("deleting an item removes its completion ticks", ghosts === 0, `${ghosts} left`);

  // ---- institution and course staff (migration 0003) -----------------------------------
  const [staffRow] = await db.select().from(schema.courseStaff).where(eq(schema.courseStaff.courseId, courseA.id));
  check("a course's primary instructor is listed as staff automatically", staffRow?.userId === instructor.id && staffRow?.role === "instructor");
  await expectReject(
    "the primary instructor can't be removed from the staff",
    (tx) => tx.delete(schema.courseStaff).where(eq(schema.courseStaff.courseId, courseA.id)),
    /primary instructor/i,
  );
  await expectReject(
    "a student account can't be course staff",
    (tx) => tx.insert(schema.courseStaff).values({ courseId: courseA.id, userId: student.id, role: "teaching_assistant" }),
    /different kind of account/i,
  );
  const [dept] = await db.insert(schema.departments).values({ name: `Dept ${tag}` }).returning();
  const [prog] = await db.insert(schema.programmes).values({ departmentId: dept.id, name: "Prog", semesters: 8 }).returning();
  const [sess] = await db.insert(schema.academicSessions).values({ name: `S ${tag}`, startsOn: "2026-07-01", endsOn: "2027-06-30" }).returning();
  const [term1] = await db.insert(schema.terms).values({ sessionId: sess.id, name: "Odd", startsOn: "2026-07-15", endsOn: "2026-12-20" }).returning();
  const [bat] = await db.insert(schema.batches).values({ programmeId: prog.id, intakeYear: 2024, name: "B 2024" }).returning();
  const [secX, secY] = await db.insert(schema.classSections).values([{ batchId: bat.id, name: "A" }, { batchId: bat.id, name: "B" }]).returning();
  await expectReject(
    "a term must end after it starts",
    (tx) => tx.insert(schema.terms).values({ sessionId: sess.id, name: "Bad", startsOn: "2026-12-20", endsOn: "2026-07-15" }),
    /check|dates/i,
  );
  await expectReject(
    "an instructor account can't be placed in a class section",
    (tx) => tx.insert(schema.studentSections).values({ studentId: instructor.id, termId: term1.id, sectionId: secX.id }),
    /different kind of account/i,
  );
  await expectReject(
    "a student account can't hold a department role",
    (tx) => tx.insert(schema.roleAssignments).values({ userId: student.id, role: "department_admin", departmentId: dept.id }),
    /different kind of account/i,
  );
  await db.insert(schema.studentSections).values({ studentId: student.id, termId: term1.id, sectionId: secX.id });
  await expectReject(
    "a student has one section per term",
    (tx) => tx.insert(schema.studentSections).values({ studentId: student.id, termId: term1.id, sectionId: secY.id }),
    /duplicate|unique/i,
  );
  await expectReject(
    "structure in use can't be deleted (sections have students)",
    (tx) => tx.delete(schema.classSections).where(eq(schema.classSections.id, secX.id)),
    /foreign key|violates/i,
  );

  // ---- history ---------------------------------------------------------------------
  const [ev] = await db.insert(schema.auditLog).values({ userId: student.id, action: "login" }).returning();
  await expectReject("audit log rows can't be edited", (tx) => tx.update(schema.auditLog).set({ action: "x" }).where(eq(schema.auditLog.id, ev.id)), /append-only/i);
  await expectReject("audit log rows can't be deleted", (tx) => tx.delete(schema.auditLog).where(eq(schema.auditLog.id, ev.id)), /append-only/i);
  await expectReject("users with academic records can't be deleted", (tx) => tx.delete(schema.users).where(eq(schema.users.id, student.id)), /foreign key|violates|append-only/i);
  const maintenance = await rejected(async (tx) => {
    await tx.execute(sql`set local eduwave.allow_history_maintenance = 'on'`);
    await tx.delete(schema.auditLog).where(eq(schema.auditLog.id, ev.id));
  });
  check("deliberate history maintenance is possible for a DBA", maintenance === null, maintenance ?? "");

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("FAIL  unexpected error:", err);
  process.exit(1);
});
