import { ThreadPage } from "@/components/pages/thread-page";
import { routeIds } from "@/lib/route-ids";

export default async function Page({ params }: PageProps<"/student/courses/[courseId]/discussions/[threadId]">) {
  const { courseId, threadId } = routeIds(await params);
  return <ThreadPage role="student" courseId={courseId} threadId={threadId} />;
}
