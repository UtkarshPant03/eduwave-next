import { ArrowLeft, Eye } from "lucide-react";
import Link from "next/link";
import { deleteBoard } from "@/app/actions/boards";
import { BoardEditor } from "@/components/client/board-editor";
import { Badge, Button } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";
import { getBoardForUser, listTeacherClasses } from "@/lib/data";

export async function BoardEditorPage({ role, boardId }: { role: "teacher" | "student"; boardId: string }) {
  const user = await requireUser();
  const { board, readOnly } = await getBoardForUser(user, boardId);
  const classes = role === "teacher" && !readOnly ? await listTeacherClasses(user.id) : [];

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/${role}/boards`} className="grid size-9 place-items-center rounded-lg hover:bg-surface-2" aria-label="Back to boards">
          <ArrowLeft className="size-4" />
        </Link>
        {readOnly && <Badge><Eye className="size-3" /> View only</Badge>}
        <div className="flex-1" />
        {!readOnly && (
          <form action={deleteBoard}>
            <input type="hidden" name="boardId" value={board.id} />
            <Button variant="danger" size="sm">Delete</Button>
          </form>
        )}
      </div>
      <BoardEditor
        boardId={board.id}
        title={board.title}
        initialScene={board.scene}
        readOnly={readOnly}
        classes={classes.map((c) => ({ id: c.id, name: c.name }))}
        sharedClassId={board.sharedClassId}
      />
    </div>
  );
}
