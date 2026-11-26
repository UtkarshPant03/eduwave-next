import { BoardEditorPage } from "@/components/pages/board-editor-page";

export default async function Page({ params }: PageProps<"/instructor/boards/[boardId]">) {
  const { boardId } = await params;
  return <BoardEditorPage role="instructor" boardId={boardId} />;
}
