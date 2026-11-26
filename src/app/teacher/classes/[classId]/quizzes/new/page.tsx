import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
import { requireTeacher } from "@/lib/auth/dal";
import { getTeacherClass } from "@/lib/data";
import { QuizBuilder } from "./quiz-builder";

export default async function NewQuizPage({ params }: PageProps<"/teacher/classes/[classId]/quizzes/new">) {
  const { classId } = await params;
  const teacher = await requireTeacher();
  const klass = await getTeacherClass(teacher.id, classId);

  return (
    <>
      <PageHeader
        title="New quiz"
        subtitle={<>For <Link href={`/teacher/classes/${classId}`} className="underline">{klass.name}</Link>. Students are notified when you publish.</>}
      />
      <QuizBuilder classId={classId} aiAvailable={aiEnabled()} />
    </>
  );
}
