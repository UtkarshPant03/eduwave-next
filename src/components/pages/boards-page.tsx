import { PenTool, Plus, Users } from "lucide-react";
import Link from "next/link";
import { createBoard } from "@/app/actions/boards";
import { Badge, Button, Card, Empty, Input, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";
import { listBoards } from "@/lib/data";
import { formatRelative, requestTime } from "@/lib/format";

export async function BoardsPage({ role }: { role: "teacher" | "student" }) {
  const user = await requireUser();
  const boards = await listBoards(user);
  const mine = boards.filter((b) => b.ownerId === user.id);
  const shared = boards.filter((b) => b.ownerId !== user.id);
  const now = requestTime();

  const grid = (items: typeof boards) => (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((b) => (
        <li key={b.id}>
          <Link
            href={`/${role}/boards/${b.id}`}
            className="group block rounded-xl border border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
          >
            <div className="mb-3 grid h-24 place-items-center rounded-lg bg-surface-2 text-muted group-hover:text-accent">
              <PenTool className="size-8" />
            </div>
            <p className="truncate font-medium">{b.title}</p>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
              {b.ownerId === user.id ? `Edited ${formatRelative(b.updatedAt, now)}` : `By ${b.ownerName}`}
              {b.sharedClassId && b.ownerId === user.id && <Badge tone="accent"><Users className="size-3" /> Shared</Badge>}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <PageHeader title="Whiteboards" subtitle="Sketch diagrams, work through problems and plan lessons. Saved automatically." />
      <Card className="mb-6">
        <form action={createBoard} className="flex flex-wrap gap-2">
          <Input name="title" placeholder="New board title, e.g. Photosynthesis diagram" maxLength={80} className="max-w-md flex-1" />
          <Button><Plus className="size-4" /> New board</Button>
        </form>
      </Card>
      <h2 className="mb-3 text-sm font-semibold text-muted">My boards</h2>
      {mine.length ? grid(mine) : <Empty icon={<PenTool />}>No boards yet. Create one above.</Empty>}
      {role === "student" && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-muted">Shared by your teacher</h2>
          {shared.length ? grid(shared) : <Empty>Your teacher hasn&apos;t shared any boards yet.</Empty>}
        </>
      )}
    </>
  );
}
