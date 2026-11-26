import { ArrowLeft, Eye } from "lucide-react";
import Link from "next/link";
import { deleteBoard } from "@/app/actions/boards";
import { BoardEditor } from "@/components/client/board-editor";
import { Badge, Button } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";
import { listInstructorCourses } from "@/lib/data/courses";
import { getBoardForUser } from "@/lib/data/shared";

export async function BoardEditorPage({ role, boardId }: { role: "instructor" | "student"; boardId: string }) {
  const user = await requireUser();
  const { board, readOnly } = await getBoardForUser(user, boardId);
  const courses = role === "instructor" && !readOnly ? await listInstructorCourses(user.id) : [];

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/${role}/boards`} className="grid size-9 place-items-center rounded-xl hover:bg-surface-2" aria-label="Back to boards">
          <ArrowLeft className="size-4" />
        </Link>
        {readOnly && <Badge><Eye /> View only</Badge>}
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
        classes={courses.map((c) => ({ id: c.id, name: `${c.code} · ${c.title}` }))}
        sharedClassId={board.sharedCourseId}
      />
    </div>
  );
}
