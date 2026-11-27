import { ThreadPage } from "@/components/pages/thread-page";

export default async function Page({ params }: PageProps<"/student/courses/[courseId]/discussions/[threadId]">) {
  const { courseId, threadId } = await params;
  return <ThreadPage role="student" courseId={courseId} threadId={threadId} />;
}
