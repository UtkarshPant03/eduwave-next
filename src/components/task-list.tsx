import { addTask, deleteTask, toggleTask } from "@/app/actions/tasks";
import { listTasks } from "@/lib/data";
import { Card, Input } from "./ui";

/** Personal to-do list (server-rendered; each button is a tiny Server Action form). */
export async function TaskList({ userId }: { userId: string }) {
  const tasks = await listTasks(userId);
  return (
    <Card title="My tasks">
      <form action={addTask} className="mb-4 flex gap-2">
        <Input name="text" placeholder="Add a task…" required maxLength={200} aria-label="New task" />
        <button className="rounded-md border border-border px-3 text-sm hover:bg-background">Add</button>
      </form>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted">Nothing on your list.</p>
      ) : (
        <ul className="divide-y divide-border">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
              <form action={toggleTask}>
                <input type="hidden" name="taskId" value={t.id} />
                <button
                  aria-label={t.done ? "Mark as not done" : "Mark as done"}
                  className={`grid size-5 place-items-center rounded border ${t.done ? "border-success bg-success text-surface" : "border-border"}`}
                >
                  {t.done ? "✓" : ""}
                </button>
              </form>
              <span className={`flex-1 ${t.done ? "text-muted line-through" : ""}`}>{t.text}</span>
              <form action={deleteTask}>
                <input type="hidden" name="taskId" value={t.id} />
                <button className="text-xs text-muted hover:text-danger" aria-label={`Delete ${t.text}`}>
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
