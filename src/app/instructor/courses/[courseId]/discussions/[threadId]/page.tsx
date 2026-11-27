import { ThreadPage } from "@/components/pages/thread-page";

export default async function Page({ params }: PageProps<"/instructor/courses/[courseId]/discussions/[threadId]">) {
  const { courseId, threadId } = await params;
  return <ThreadPage role="instructor" courseId={courseId} threadId={threadId} />;
}
