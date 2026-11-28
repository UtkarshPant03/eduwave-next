import type { Metadata } from "next";
import { QuizBuilder } from "@/components/client/quiz-builder";
import { PageHeader } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
import { requireInstructor } from "@/lib/auth/dal";
import { getQuizForEdit } from "@/lib/data/assessments";
import { bankForBuilder } from "@/lib/data/question-bank";
import { listSections } from "@/lib/data/courses";
import { requestTime } from "@/lib/format";
import { routeIds } from "@/lib/route-ids";

export const metadata: Metadata = { title: "Edit quiz" };

export default async function EditQuizPage({ params }: PageProps<"/instructor/quizzes/[quizId]/edit">) {
  const { quizId } = routeIds(await params);
  const user = await requireInstructor();
  const { course, quiz, questions, slots, attemptCount, attemptsUsed, questionCount } = await getQuizForEdit(user, quizId);
  const [sections, bank] = await Promise.all([listSections(course.id), bankForBuilder(course.id)]);
  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "My courses", href: "/instructor/courses" },
          { label: course.code, href: `/instructor/courses/${course.id}` },
          { label: quiz.title, href: `/instructor/quizzes/${quiz.id}` },
          { label: "Edit" },
        ]}
        title="Edit quiz"
        subtitle="Students are notified if you change the deadline."
      />
      <QuizBuilder
        courseId={course.id}
        sections={sections}
        aiAvailable={aiEnabled()}
        bank={bank}
        initial={{
          id: quiz.id,
          title: quiz.title,
          description: quiz.description,
          sectionId: quiz.sectionId,
          timeLimitMinutes: quiz.timeLimitMinutes,
          deadline: quiz.deadline.toISOString(),
          opensAt: quiz.opensAt?.toISOString() ?? null,
          shuffle: quiz.shuffle,
          maxAttempts: quiz.maxAttempts,
          gradingMethod: quiz.gradingMethod,
          questions: questions.map((q) => ({
            type: q.type,
            prompt: q.prompt,
            options: q.options,
            correctIndex: q.correctIndex,
            correctIndexes: q.correctIndexes,
            acceptedAnswers: q.acceptedAnswers,
            numericAnswer: q.numericAnswer,
            tolerance: q.tolerance,
            points: q.points,
            explanation: q.explanation,
            position: q.position,
            bankQuestionId: q.bankQuestionId,
          })),
          slots: slots.map((s) => ({ position: s.position, categoryId: s.categoryId, categoryName: s.categoryName, pickCount: s.pickCount, points: s.points })),
          questionCount,
          attemptCount,
          attemptsUsed,
          deadlinePassed: quiz.deadline.getTime() <= requestTime(),
        }}
      />
    </>
  );
}
