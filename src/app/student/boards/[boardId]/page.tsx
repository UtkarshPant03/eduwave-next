import { BoardEditorPage } from "@/components/pages/board-editor-page";

export default async function Page({ params }: PageProps<"/student/boards/[boardId]">) {
  const { boardId } = await params;
  return <BoardEditorPage role="student" boardId={boardId} />;
}
