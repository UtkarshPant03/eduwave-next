import { BoardEditorPage } from "@/components/pages/board-editor-page";
import { routeIds } from "@/lib/route-ids";

export default async function Page({ params }: PageProps<"/student/boards/[boardId]">) {
  const { boardId } = routeIds(await params);
  return <BoardEditorPage role="student" boardId={boardId} />;
}
