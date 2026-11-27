/**
 * Sample university data for development, demos and classroom use.
 * Run with: npm run db:seed   (after npm run db:migrate)
 *
 * Sign-in (all sample accounts use the password  eduwave2026 ):
 *   Admin       admin@eduwave.edu
 *   Instructor  meera.iyer@eduwave.edu  (CS201, CS204)
 *               rahul.verma@eduwave.edu (MA202)
 *               sara.thomas@eduwave.edu (HS101)
 *   TA          karan.mehra@eduwave.edu (teaching assistant on CS201)
 *   (Meera Iyer is also HOD of Computer Science & Engineering; Sara Thomas coordinates HS101.)
 *   Student     24CS1001 … 24CS1012   (or their emails)
 *
 * Sample passwords are deliberately simple; real accounts must pass the password policy.
 */
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { deploymentMode } from "../src/lib/env";
import { SAMPLE_PASSWORD } from "../src/lib/sample-data";

const DAY = 86_400_000;
const now = Date.now();
const at = (days: number, hour = 23, minute = 59) => {
  const d = new Date(now + days * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
};
const room = () => `eduWave-${randomBytes(12).toString("base64url").replace(/[-_]/g, "x")}`;

const STUDENTS = [
  ["Ananya Rao", "24CS1001"], ["Arjun Mehta", "24CS1002"], ["Diya Negi", "24CS1003"], ["Kabir Rawat", "24CS1004"],
  ["Ishita Bhatt", "24CS1005"], ["Rohan Joshi", "24CS1006"], ["Sneha Pillai", "24CS1007"], ["Vikram Singh", "24CS1008"],
  ["Aisha Khan", "24CS1009"], ["Nikhil Sharma", "24CS1010"], ["Priya Nair", "24CS1011"], ["Aditya Kapoor", "24CS1012"],
] as const;

async function main() {
  // Sample accounts share a password that is printed in the README: never in production.
  if (deploymentMode() === "production") {
    console.error("Refusing to load sample data: this is a production configuration (EDUWAVE_ENV/NODE_ENV).");
    console.error("Sample accounts use a published password. Use `npm run create-admin` for a real installation.");
    process.exit(1);
  }
  if (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.email, "admin@eduwave.edu") })) {
    console.log("Seed data already present, skipping.");
    return;
  }
  const hash = await bcrypt.hash(SAMPLE_PASSWORD, 12);

  await db.transaction(async (tx) => {
    const u = schema.users;
    await tx.insert(u).values({ role: "admin", name: "Office of Academic IT", email: "admin@eduwave.edu", passwordHash: hash, department: "IT Services" });
    const [meera, rahul, sara] = await tx
      .insert(u)
      .values([
        { role: "instructor" as const, name: "Dr. Meera Iyer", email: "meera.iyer@eduwave.edu", passwordHash: hash, department: "Computer Science & Engineering", program: "Associate Professor" },
        { role: "instructor" as const, name: "Dr. Rahul Verma", email: "rahul.verma@eduwave.edu", passwordHash: hash, department: "Mathematics", program: "Assistant Professor" },
        { role: "instructor" as const, name: "Prof. Sara Thomas", email: "sara.thomas@eduwave.edu", passwordHash: hash, department: "Humanities & Social Sciences", program: "Professor" },
        { role: "instructor" as const, name: "Karan Mehra", email: "karan.mehra@eduwave.edu", passwordHash: hash, department: "Computer Science & Engineering", program: "Teaching assistant" },
      ])
      .returning();
    const karan = (await tx.query.users.findFirst({ where: (x, { eq }) => eq(x.email, "karan.mehra@eduwave.edu") }))!;
    const students = await tx
      .insert(u)
      .values(
        STUDENTS.map(([name, sid]) => ({
          role: "student" as const,
          name,
          studentId: sid,
          email: `${name.toLowerCase().replace(/\s+/g, ".")}@student.eduwave.edu`,
          passwordHash: hash,
          department: "Computer Science & Engineering",
          program: "B.Tech CSE, Year 2",
          lastLoginAt: new Date(now - Math.floor(Math.random() * 5) * DAY),
        })),
      )
      .returning();

    // Academic structure (sample data, not Graphic Era's official structure).
    const [cse, maths, hss] = await tx
      .insert(schema.departments)
      .values([{ name: "Computer Science & Engineering" }, { name: "Mathematics" }, { name: "Humanities & Social Sciences" }])
      .returning();
    const [btech] = await tx.insert(schema.programmes).values({ departmentId: cse.id, name: "B.Tech Computer Science and Engineering", semesters: 8 }).returning();
    const [session] = await tx.insert(schema.academicSessions).values({ name: "2026–27", startsOn: "2026-07-01", endsOn: "2027-06-30" }).returning();
    const [oddSem] = await tx.insert(schema.terms).values({ sessionId: session.id, name: "Odd semester", startsOn: "2026-07-15", endsOn: "2026-12-20" }).returning();
    await tx.insert(schema.terms).values({ sessionId: session.id, name: "Even semester", startsOn: "2027-01-05", endsOn: "2027-05-31" });
    const [batch] = await tx.insert(schema.batches).values({ programmeId: btech.id, intakeYear: 2024, name: "B.Tech CSE 2024" }).returning();
    const [secA, secB] = await tx.insert(schema.classSections).values([{ batchId: batch.id, name: "A" }, { batchId: batch.id, name: "B" }]).returning();
    await tx.insert(schema.studentSections).values(students.map((s, i) => ({ studentId: s.id, termId: oddSem.id, sectionId: i < 6 ? secA.id : secB.id })));

    const term = "2026–27 · Odd semester";
    const linked = { termId: oddSem.id };
    const [ds, dbms, prob, comm] = await tx
      .insert(schema.courses)
      .values([
        { ...linked, departmentId: cse.id, code: "CS201", title: "Data Structures and Algorithms", department: "Computer Science & Engineering", term, credits: 4, color: "indigo", instructorId: meera.id, enrollmentKey: "dsa-autumn26", description: "Arrays, linked lists, stacks, queues, trees, heaps, hashing and graphs, with **asymptotic analysis** and hands-on C++ labs." },
        { ...linked, departmentId: cse.id, code: "CS204", title: "Database Management Systems", department: "Computer Science & Engineering", term, credits: 4, color: "violet", instructorId: meera.id, enrollmentKey: "dbms-autumn26", description: "Relational model, SQL, normalisation, transactions and indexing. Labs use PostgreSQL." },
        { ...linked, departmentId: maths.id, code: "MA202", title: "Probability and Statistics", department: "Mathematics", term, credits: 3, color: "teal", instructorId: rahul.id, enrollmentKey: null, description: "Probability spaces, random variables, common distributions, estimation and hypothesis testing." },
        { ...linked, departmentId: hss.id, code: "HS101", title: "Technical Communication", department: "Humanities & Social Sciences", term, credits: 2, color: "amber", instructorId: sara.id, enrollmentKey: "comm2026", description: "Writing reports, documentation and presentations for technical audiences." },
      ])
      .returning();

    // Sections taking each course; a teaching assistant on CS201.
    await tx.insert(schema.courseSections).values([
      { courseId: ds.id, sectionId: secA.id },
      { courseId: ds.id, sectionId: secB.id },
      { courseId: prob.id, sectionId: secA.id },
      { courseId: prob.id, sectionId: secB.id },
    ]);
    await tx.insert(schema.courseStaff).values({ courseId: ds.id, userId: karan.id, role: "teaching_assistant" });
    // Department role and a course coordinator (sample data).
    await tx.insert(schema.roleAssignments).values({ userId: meera.id, role: "hod", departmentId: cse.id });
    await tx
      .update(schema.courseStaff)
      .set({ role: "coordinator" })
      .where(and(eq(schema.courseStaff.courseId, comm.id), eq(schema.courseStaff.userId, sara.id)));

    // Enrolments: everyone in CS201/MA202/HS101, the first 9 in CS204.
    await tx.insert(schema.enrollments).values([
      ...students.map((s) => ({ courseId: ds.id, userId: s.id, enrolledAt: new Date(now - 40 * DAY) })),
      ...students.map((s) => ({ courseId: prob.id, userId: s.id, enrolledAt: new Date(now - 40 * DAY) })),
      ...students.map((s) => ({ courseId: comm.id, userId: s.id, enrolledAt: new Date(now - 38 * DAY) })),
      ...students.slice(0, 9).map((s) => ({ courseId: dbms.id, userId: s.id, enrolledAt: new Date(now - 39 * DAY) })),
    ]);

    // Attendance: three past CS201 classes (no minimum configured: that's the university's policy to set).
    const classes = await tx
      .insert(schema.attendanceSessions)
      .values([
        { courseId: ds.id, heldAt: at(-9, 10, 0), topic: "Arrays and linked lists", createdBy: meera.id },
        { courseId: ds.id, heldAt: at(-7, 10, 0), topic: "Stacks and queues", createdBy: meera.id },
        { courseId: ds.id, heldAt: at(-2, 10, 0), topic: "Binary search trees", createdBy: meera.id },
      ])
      .returning();
    await tx.insert(schema.attendanceRecords).values(
      classes.flatMap((c, k) =>
        students.map((s, i) => ({
          sessionId: c.id,
          studentId: s.id,
          markedBy: meera.id,
          note: "marked",
          status: (i === 3 && k < 2 ? "absent" : i === 5 && k === 1 ? "late" : i === 7 && k === 2 ? "excused" : "present") as "present" | "absent" | "late" | "excused",
        })),
      ),
    );

    // Sections (weeks) for every course.
    const weekTitles: Record<string, string[]> = {
      [ds.id]: ["Week 1 · Complexity analysis", "Week 2 · Arrays and linked lists", "Week 3 · Stacks and queues", "Week 4 · Trees and BSTs", "Week 5 · Heaps and hashing", "Week 6 · Graphs"],
      [dbms.id]: ["Week 1 · Relational model", "Week 2 · SQL fundamentals", "Week 3 · Joins and subqueries", "Week 4 · Normalisation", "Week 5 · Transactions"],
      [prob.id]: ["Week 1 · Probability axioms", "Week 2 · Random variables", "Week 3 · Distributions", "Week 4 · Estimation"],
      [comm.id]: ["Unit 1 · Writing for engineers", "Unit 2 · Reports and documentation", "Unit 3 · Presentations"],
    };
    const sec: Record<string, { id: string }[]> = {};
    for (const [courseId, titles] of Object.entries(weekTitles)) {
      sec[courseId] = await tx
        .insert(schema.sections)
        .values(titles.map((title, position) => ({ courseId, position, title, summary: position === 0 ? "Start here: course overview, policies and the first readings." : null })))
        .returning({ id: schema.sections.id });
    }

    // Materials (real, public learning resources).
    await tx.insert(schema.resources).values([
      { courseId: ds.id, sectionId: sec[ds.id][0].id, title: "Big-O notation (Khan Academy)", url: "https://www.khanacademy.org/computing/computer-science/algorithms/asymptotic-notation/a/big-o-notation" },
      { courseId: ds.id, sectionId: sec[ds.id][1].id, title: "Linked list (Wikipedia)", url: "https://en.wikipedia.org/wiki/Linked_list" },
      { courseId: ds.id, sectionId: sec[ds.id][2].id, title: "Stack data structure (Wikipedia)", url: "https://en.wikipedia.org/wiki/Stack_(abstract_data_type)" },
      { courseId: ds.id, sectionId: sec[ds.id][3].id, title: "Binary search tree visualisation (VisuAlgo)", url: "https://visualgo.net/en/bst" },
      { courseId: dbms.id, sectionId: sec[dbms.id][1].id, title: "PostgreSQL tutorial (official docs)", url: "https://www.postgresql.org/docs/current/tutorial.html" },
      { courseId: dbms.id, sectionId: sec[dbms.id][3].id, title: "Database normalisation (Wikipedia)", url: "https://en.wikipedia.org/wiki/Database_normalization" },
      { courseId: prob.id, sectionId: sec[prob.id][0].id, title: "Probability (Khan Academy)", url: "https://www.khanacademy.org/math/statistics-probability/probability-library" },
      { courseId: comm.id, sectionId: sec[comm.id][1].id, title: "Technical writing courses (Google)", url: "https://developers.google.com/tech-writing" },
    ]);

    // Assignments: one graded, one submitted & awaiting grading, one upcoming.
    const [a1, a2, a3, a4] = await tx
      .insert(schema.assignments)
      .values([
        { courseId: ds.id, sectionId: sec[ds.id][1].id, title: "Lab 2: Singly linked list", instructions: "### Objective\nImplement a singly linked list in C++ with `insert`, `remove` and `reverse`.\n\n### Deliverables\n- Source code (.zip or .cpp)\n- A short note on the time complexity of each operation", dueAt: at(-10), maxPoints: 20, lateDays: 2 },
        { courseId: ds.id, sectionId: sec[ds.id][3].id, title: "Lab 4: Binary search trees", instructions: "### Objective\nImplement BST insert, search and in-order traversal.\n\n**Bonus:** implement deletion with all three cases.", dueAt: at(-1), maxPoints: 20, lateDays: 3 },
        { courseId: ds.id, sectionId: sec[ds.id][4].id, title: "Lab 5: Hash table with chaining", instructions: "Implement a hash table with separate chaining and report the load factor after 10,000 random inserts.", dueAt: at(5), maxPoints: 25, lateDays: 2 },
        { courseId: dbms.id, sectionId: sec[dbms.id][2].id, title: "SQL worksheet 3: joins", instructions: "Answer the 10 join questions in the attached worksheet. Submit your SQL queries as text.", dueAt: at(3), maxPoints: 30, lateDays: 1 },
      ])
      .returning();
    const lab2Grades = [18, 20, 15, 12, 17, 19, 16, 14, 20, 11, 17, 13];
    await tx.insert(schema.submissions).values(
      students.map((s, i) => ({
        assignmentId: a1.id,
        studentId: s.id,
        text: "Implementation attached. insert O(1) at head, remove O(n), reverse O(n).",
        submittedAt: new Date(a1.dueAt.getTime() - (i % 4) * 3_600_000 + (i === 9 ? DAY : 0)),
        grade: lab2Grades[i],
        feedback: lab2Grades[i] >= 17 ? "Clean code and correct complexity analysis. Well done." : "Works, but reverse() leaks the old head pointer. Review pointer updates.",
        gradedAt: new Date(now - 6 * DAY),
      })),
    );
    await tx.insert(schema.submissions).values(
      students.slice(1, 8).map((s, i) => ({ assignmentId: a2.id, studentId: s.id, text: "BST implementation with recursive insert and in-order traversal. Bonus deletion included.", submittedAt: new Date(a2.dueAt.getTime() - (i + 1) * 3_600_000) })),
    );
    // a3 (upcoming, CS201) and a4 (upcoming, CS204) have no submissions yet.
    void [a3, a4];

    // Quizzes: one closed with results, one open.
    const [q1] = await tx
      .insert(schema.quizzes)
      .values({ courseId: ds.id, sectionId: sec[ds.id][0].id, title: "Quiz 1: Complexity analysis", timeLimitMinutes: 15, deadline: at(-14), description: "Closed book." })
      .returning();
    const q1qs = await tx
      .insert(schema.questions)
      .values([
        { quizId: q1.id, position: 0, prompt: "What is the time complexity of binary search on a sorted array of n elements?", options: ["O(n)", "O(log n)", "O(n log n)", "O(1)"], correctIndex: 1, explanation: "Each comparison halves the search range." },
        { quizId: q1.id, position: 1, prompt: "Which grows fastest as n → ∞?", options: ["n²", "2ⁿ", "n log n", "n³"], correctIndex: 1, explanation: "Exponential growth eventually dominates any polynomial." },
        { quizId: q1.id, position: 2, prompt: "Accessing the i-th element of a linked list takes…", options: ["O(1)", "O(log n)", "O(n)", "O(n²)"], correctIndex: 2, explanation: "You must follow i pointers from the head." },
        { quizId: q1.id, position: 3, prompt: "Two nested loops, each running n times, take…", options: ["O(n)", "O(2n)", "O(n²)", "O(log n)"], correctIndex: 2 },
        { quizId: q1.id, position: 4, prompt: "Big-O describes…", options: ["An exact running time", "An asymptotic upper bound", "The best case only", "Memory usage only"], correctIndex: 1 },
      ])
      .returning();
    for (const [i, s] of students.entries()) {
      const picks = q1qs.map((q, k) => ((i + k) % 5 === 0 ? (q.correctIndex + 1) % q.options.length : q.correctIndex));
      const score = picks.filter((p, k) => p === q1qs[k].correctIndex).length;
      const started = new Date(q1.deadline.getTime() - 3 * DAY);
      // Same order as a real attempt: start, answer, then finish (answers are frozen after that).
      const [att] = await tx.insert(schema.attempts).values({ quizId: q1.id, studentId: s.id, startedAt: started, total: q1qs.length }).returning();
      await tx.insert(schema.answers).values(q1qs.map((q, k) => ({ attemptId: att.id, quizId: q1.id, questionId: q.id, selectedIndex: picks[k] })));
      await tx
        .update(schema.attempts)
        .set({ submittedAt: new Date(started.getTime() + (6 + i) * 60_000), score })
        .where(eq(schema.attempts.id, att.id));
    }
    const [q2] = await tx
      .insert(schema.quizzes)
      .values({ courseId: prob.id, sectionId: sec[prob.id][1].id, title: "Quiz 2: Random variables", timeLimitMinutes: 10, deadline: at(4) })
      .returning();
    await tx.insert(schema.questions).values([
      { quizId: q2.id, position: 0, prompt: "A fair die is rolled. What is P(even)?", options: ["1/6", "1/3", "1/2", "2/3"], correctIndex: 2, explanation: "Three of six outcomes are even." },
      { quizId: q2.id, position: 1, prompt: "E[X] for X ~ Bernoulli(p) is…", options: ["p", "1 − p", "p(1 − p)", "1"], correctIndex: 0 },
      { quizId: q2.id, position: 2, prompt: "Var(aX) equals…", options: ["a·Var(X)", "a²·Var(X)", "Var(X)", "|a|·Var(X)"], correctIndex: 1, explanation: "Variance scales with the square of the constant." },
    ]);

    // Live classes.
    await tx.insert(schema.liveSessions).values([
      { courseId: ds.id, sectionId: sec[ds.id][4].id, title: "Doubt-clearing: hashing", startsAt: at(2, 16, 0), durationMinutes: 60, room: room() },
      { courseId: dbms.id, sectionId: sec[dbms.id][2].id, title: "SQL joins walkthrough", startsAt: at(1, 11, 0), durationMinutes: 45, room: room() },
      { courseId: prob.id, title: "Problem-solving session", startsAt: at(6, 15, 0), durationMinutes: 60, room: room() },
    ]);

    // Discussions.
    const [ann] = await tx
      .insert(schema.threads)
      .values([
        { courseId: ds.id, authorId: meera.id, title: "Mid-semester exam schedule", body: "The mid-semester exam covers **Weeks 1–4**.\n\n- Date: announced on the department notice board\n- Format: 2 hours, closed book\n- Bring your university ID", isAnnouncement: true, pinned: true, createdAt: new Date(now - 2 * DAY), lastActivityAt: new Date(now - 2 * DAY) },
        { courseId: ds.id, authorId: students[2].id, title: "Lab 4: recursion vs iteration for insert?", body: "Is it fine to implement BST insert iteratively, or does it have to be recursive?", createdAt: new Date(now - 3 * DAY), lastActivityAt: new Date(now - DAY) },
        { courseId: prob.id, authorId: rahul.id, title: "Welcome to MA202", body: "Welcome! Please go through the Week 1 readings before our first tutorial.", isAnnouncement: true, pinned: true, createdAt: new Date(now - 30 * DAY), lastActivityAt: new Date(now - 30 * DAY) },
      ])
      .returning();
    const question = await tx.query.threads.findFirst({ where: (t, { like }) => like(t.title, "Lab 4:%") });
    if (question) {
      await tx.insert(schema.posts).values([
        { threadId: question.id, authorId: students[5].id, body: "I did it iteratively with a parent pointer; works fine.", createdAt: new Date(now - 2 * DAY) },
        { threadId: question.id, authorId: meera.id, body: "Either is fine. Just mention the trade-off (stack depth vs. code clarity) in your note.", createdAt: new Date(now - DAY) },
      ]);
    }

    // Some notifications for students.
    await tx.insert(schema.notifications).values(
      students.flatMap((s) => [
        { userId: s.id, title: "CS201 announcement: Mid-semester exam schedule", body: "The mid-semester exam covers Weeks 1–4.", link: `/student/courses/${ds.id}/discussions/${ann.id}`, createdAt: new Date(now - 2 * DAY) },
        { userId: s.id, title: "CS201: \"Lab 2: Singly linked list\" graded", link: `/student/assignments/${a1.id}`, createdAt: new Date(now - 6 * DAY), readAt: new Date(now - 5 * DAY) },
      ]),
    );
  });

  console.log("Seeded: 1 admin, 3 instructors + 1 teaching assistant, 12 students in sections A/B, 4 courses with sections, materials, assignments, quizzes, live classes and discussions.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
