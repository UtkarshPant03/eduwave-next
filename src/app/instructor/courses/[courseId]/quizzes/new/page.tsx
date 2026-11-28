import { QuizBuilder } from "@/components/client/quiz-builder";
import { PageHeader } from "@/components/ui";
import { courseForInstructor } from "@/lib/access";
import { aiEnabled } from "@/lib/ai";
import { requireInstructor } from "@/lib/auth/dal";
import { listSections } from "@/lib/data/courses";
import { bankForBuilder } from "@/lib/data/question-bank";
import { routeIds } from "@/lib/route-ids";

export default async function NewQuizPage({ params }: PageProps<"/instructor/courses/[courseId]/quizzes/new">) {
  const { courseId } = routeIds(await params);
  const user = await requireInstructor();
  const course = await courseForInstructor(user, courseId);
  const [sections, bank] = await Promise.all([listSections(course.id), bankForBuilder(course.id)]);
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "My courses", href: "/instructor/courses" }, { label: course.code, href: `/instructor/courses/${course.id}` }, { label: "New quiz" }]}
        title="New quiz"
        subtitle="Timed and graded on the server. Students are notified when you publish."
      />
      <QuizBuilder courseId={course.id} sections={sections} aiAvailable={aiEnabled()} bank={bank} />
    </>
  );
}
