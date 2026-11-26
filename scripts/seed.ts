/**
 * Creates demo data for local development and classroom demos.
 * Run with: npm run db:seed   (after npm run db:migrate)
 *
 * Demo logins:
 *   Teacher  teacher@example.com / teacher123
 *   Student  S001 (or S002, S003) / student123
 * (Demo passwords are deliberately weak. Real accounts must pass the password policy.)
 */
import bcrypt from "bcryptjs";
import { db, schema } from "../src/db";

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const existing = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.email, "teacher@example.com") });
  if (existing) {
    console.log("Seed data already present, skipping.");
    return;
  }

  const teacherHash = await bcrypt.hash("teacher123", 12);
  const studentHash = await bcrypt.hash("student123", 12);

  await db.transaction(async (tx) => {
    const [teacher] = await tx
      .insert(schema.users)
      .values({ role: "teacher", name: "Demo Teacher", email: "teacher@example.com", passwordHash: teacherHash })
      .returning();
    const [klass] = await tx.insert(schema.classes).values({ name: "Class 10-A", teacherId: teacher.id }).returning();

    const students = await tx
      .insert(schema.users)
      .values(
        ["Aarav Sharma", "Diya Negi", "Kabir Rawat"].map((name, i) => ({
          role: "student" as const,
          name,
          rollNumber: `S00${i + 1}`,
          passwordHash: studentHash,
          classId: klass.id,
        })),
      )
      .returning();

    // An open quiz (nobody has taken it yet).
    const [open] = await tx
      .insert(schema.quizzes)
      .values({ classId: klass.id, title: "Fractions warm-up", subject: "Mathematics", timeLimitMinutes: 5, deadline: new Date(Date.now() + 7 * DAY) })
      .returning();
    await tx.insert(schema.questions).values([
      { quizId: open.id, position: 0, prompt: "What is 1/2 + 1/4?", options: ["3/4", "2/6", "1/6", "2/4"], correctIndex: 0, explanation: "1/2 = 2/4, and 2/4 + 1/4 = 3/4." },
      { quizId: open.id, position: 1, prompt: "Which fraction is largest?", options: ["2/5", "3/10", "1/2", "4/9"], correctIndex: 2, explanation: "As decimals: 0.4, 0.3, 0.5, 0.44. So 1/2 is largest." },
      { quizId: open.id, position: 2, prompt: "Simplify 6/8.", options: ["2/3", "3/4", "6/8", "4/3"], correctIndex: 1, explanation: "Divide top and bottom by 2." },
    ]);

    // A closed quiz with results, so charts, leaderboards and revealed answers have data.
    const [past] = await tx
      .insert(schema.quizzes)
      .values({ classId: klass.id, title: "Cells & organisms", subject: "Science", timeLimitMinutes: 10, deadline: new Date(Date.now() - DAY) })
      .returning();
    const qs = await tx
      .insert(schema.questions)
      .values([
        { quizId: past.id, position: 0, prompt: "Which organelle is the 'powerhouse' of the cell?", options: ["Nucleus", "Mitochondrion", "Ribosome", "Vacuole"], correctIndex: 1, explanation: "Mitochondria release energy from food through respiration." },
        { quizId: past.id, position: 1, prompt: "Plant cells have a cell wall made of…", options: ["Cellulose", "Chitin", "Protein", "Starch"], correctIndex: 0, explanation: "Cellulose gives plant cell walls their strength." },
        { quizId: past.id, position: 2, prompt: "Where does photosynthesis happen?", options: ["Mitochondria", "Nucleus", "Chloroplasts", "Cell membrane"], correctIndex: 2, explanation: "Chloroplasts contain chlorophyll, which captures light." },
        { quizId: past.id, position: 3, prompt: "Which is a unicellular organism?", options: ["Amoeba", "Frog", "Fern", "Mushroom"], correctIndex: 0 },
      ])
      .returning();
    // Answers per student: S001 3/4, S002 4/4, S003 2/4 (S003 falls for the common misconception on Q3).
    const picks = [
      [1, 0, 0, 0],
      [1, 0, 2, 0],
      [0, 0, 0, 0],
    ];
    for (const [i, s] of students.entries()) {
      const started = new Date(Date.now() - 2 * DAY);
      const score = picks[i].filter((p, k) => p === qs[k].correctIndex).length;
      const [attempt] = await tx
        .insert(schema.attempts)
        .values({ quizId: past.id, studentId: s.id, startedAt: started, submittedAt: new Date(started.getTime() + (4 + i) * 60_000), score, total: qs.length })
        .returning();
      await tx.insert(schema.answers).values(qs.map((q, k) => ({ attemptId: attempt.id, questionId: q.id, selectedIndex: picks[i][k] })));
    }

    await tx.insert(schema.resources).values({
      classId: klass.id,
      title: "Fractions explained (Khan Academy)",
      subject: "Mathematics",
      url: "https://www.khanacademy.org/math/arithmetic/fraction-arithmetic",
    });

    await tx.insert(schema.liveSessions).values({
      classId: klass.id,
      title: "Doubt-clearing session: Fractions",
      startsAt: new Date(Date.now() + 2 * DAY),
      durationMinutes: 45,
      room: `eduWave-demo${Math.random().toString(36).slice(2, 14)}`,
    });

    await tx.insert(schema.notifications).values(
      students.map((s) => ({ userId: s.id, title: "New quiz: Fractions warm-up", body: "Mathematics · 5 min", link: `/student/quizzes/${open.id}` })),
    );
  });

  console.log("Seeded demo teacher, class, 3 students, 2 quizzes (1 graded), a resource, a live class and notifications.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
