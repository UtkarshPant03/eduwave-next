import { BoardEditorPage } from "@/components/pages/board-editor-page";
import { routeIds } from "@/lib/route-ids";

export default async function Page({ params }: PageProps<"/instructor/boards/[boardId]">) {
  const { boardId } = routeIds(await params);
  return <BoardEditorPage role="instructor" boardId={boardId} />;
}
