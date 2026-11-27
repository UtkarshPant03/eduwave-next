import { ThreadPage } from "@/components/pages/thread-page";
import { routeIds } from "@/lib/route-ids";

export default async function Page({ params }: PageProps<"/instructor/courses/[courseId]/discussions/[threadId]">) {
  const { courseId, threadId } = routeIds(await params);
  return <ThreadPage role="instructor" courseId={courseId} threadId={threadId} />;
}
