import { BoardEditorPage } from "@/components/pages/board-editor-page";

export default async function Page({ params }: PageProps<"/teacher/boards/[boardId]">) {
  const { boardId } = await params;
  return <BoardEditorPage role="teacher" boardId={boardId} />;
}
