import type { Metadata } from "next";
import { QuizBuilder } from "@/components/client/quiz-builder";
import { PageHeader } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
import { requireInstructor } from "@/lib/auth/dal";
import { getQuizForEdit } from "@/lib/data/assessments";
import { listSections } from "@/lib/data/courses";
import { requestTime } from "@/lib/format";
import { routeIds } from "@/lib/route-ids";

export const metadata: Metadata = { title: "Edit quiz" };

export default async function EditQuizPage({ params }: PageProps<"/instructor/quizzes/[quizId]/edit">) {
  const { quizId } = routeIds(await params);
  const user = await requireInstructor();
  const { course, quiz, questions, attemptCount } = await getQuizForEdit(user, quizId);
  const sections = await listSections(course.id);
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
        initial={{
          id: quiz.id,
          title: quiz.title,
          description: quiz.description,
          sectionId: quiz.sectionId,
          timeLimitMinutes: quiz.timeLimitMinutes,
          deadline: quiz.deadline.toISOString(),
          shuffle: quiz.shuffle,
          questions: questions.map((q) => ({ prompt: q.prompt, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation })),
          attemptCount,
          deadlinePassed: quiz.deadline.getTime() <= requestTime(),
        }}
      />
    </>
  );
}
