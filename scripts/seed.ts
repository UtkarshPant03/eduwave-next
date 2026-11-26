/**
 * Creates demo data for local development and classroom demos.
 * Run with: npm run db:seed   (after npm run db:migrate)
 *
 * Demo logins:
 *   Teacher  teacher@example.com / teacher123
 *   Student  S001 (or S002, S003) / student123
 */
import bcrypt from "bcryptjs";
import { db, schema } from "../src/db";

async function main() {
  const existing = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, "teacher@example.com"),
  });
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

    const [klass] = await tx
      .insert(schema.classes)
      .values({ name: "Class 10-A", teacherId: teacher.id })
      .returning();

    await tx.insert(schema.users).values(
      ["Aarav Sharma", "Diya Negi", "Kabir Rawat"].map((name, i) => ({
        role: "student" as const,
        name,
        rollNumber: `S00${i + 1}`,
        passwordHash: studentHash,
        classId: klass.id,
      })),
    );

    const [quiz] = await tx
      .insert(schema.quizzes)
      .values({
        classId: klass.id,
        title: "Fractions warm-up",
        subject: "Mathematics",
        timeLimitMinutes: 5,
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .returning();

    await tx.insert(schema.questions).values([
      { quizId: quiz.id, position: 0, prompt: "What is 1/2 + 1/4?", options: ["3/4", "2/6", "1/6", "2/4"], correctIndex: 0 },
      { quizId: quiz.id, position: 1, prompt: "Which fraction is largest?", options: ["2/5", "3/10", "1/2", "4/9"], correctIndex: 2 },
      { quizId: quiz.id, position: 2, prompt: "Simplify 6/8.", options: ["2/3", "3/4", "6/8", "4/3"], correctIndex: 1 },
    ]);

    await tx.insert(schema.resources).values({
      classId: klass.id,
      title: "Fractions explained (Khan Academy)",
      subject: "Mathematics",
      url: "https://www.khanacademy.org/math/arithmetic/fraction-arithmetic",
    });
  });

  console.log("Seeded demo teacher, class, 3 students, 1 quiz, 1 resource.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
