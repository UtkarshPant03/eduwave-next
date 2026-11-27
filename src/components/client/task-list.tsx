"use client";

import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { addTask, deleteTask, setTaskDone } from "@/app/actions/tasks";

type Task = { id: string; text: string; done: boolean; dueDate: Date | null };
type Op = { type: "add"; task: Task } | { type: "toggle"; id: string; done: boolean } | { type: "delete"; id: string };

/**
 * useOptimistic: the UI updates immediately, the Server Action runs in the background,
 * and React swaps in the real server data when it arrives (or rolls back on error).
 */
export function TaskListClient({ tasks, today }: { tasks: Task[]; today: string }) {
  const [optimistic, apply] = useOptimistic(tasks, (state: Task[], op: Op) => {
    if (op.type === "add") return [op.task, ...state];
    if (op.type === "toggle") return state.map((t) => (t.id === op.id ? { ...t, done: op.done } : t));
    return state.filter((t) => t.id !== op.id);
  });
  const [, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [filter, setFilter] = useState<"open" | "all">("open");

  const run = (op: Op, action: () => Promise<void>) =>
    startTransition(async () => {
      apply(op);
      try {
        await action();
      } catch {
        toast.error("Couldn't save that change.");
      }
    });

  const visible = optimistic.filter((t) => filter === "all" || !t.done);
  const doneCount = optimistic.filter((t) => t.done).length;

  return (
    <div>
      <form
        className="mb-3 grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = text.trim();
          if (!value) return;
          setText("");
          setDue("");
          run(
            { type: "add", task: { id: `tmp-${Date.now()}`, text: value, done: false, dueDate: due ? new Date(`${due}T23:59:59Z`) : null } },
            () => addTask({ text: value, dueDate: due || undefined }),
          );
        }}
      >
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a task…"
            maxLength={200}
            aria-label="New task"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:outline-2 focus:outline-accent"
          />
          <button className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground" aria-label="Add task">
            <Plus className="size-4" />
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          <CalendarDays className="size-3.5" /> Due
          <input type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} className="rounded border border-border bg-surface px-1.5 py-0.5" />
        </label>
      </form>

      <div className="mb-2 flex items-center justify-between text-xs text-muted">
        <span>
          {doneCount} of {optimistic.length} done
        </span>
        <button onClick={() => setFilter(filter === "open" ? "all" : "open")} className="hover:text-foreground">
          {filter === "open" ? "Show completed" : "Hide completed"}
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">{optimistic.length ? "All tasks are complete." : "Nothing on your list."}</p>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((t) => {
            const overdue = !t.done && t.dueDate && t.dueDate.toISOString().slice(0, 10) < today;
            return (
              <li key={t.id} className="group flex items-center gap-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={t.done}
                  disabled={t.id.startsWith("tmp-")}
                  onChange={(e) => run({ type: "toggle", id: t.id, done: e.target.checked }, () => setTaskDone(t.id, e.target.checked))}
                  aria-label={`Mark "${t.text}" as ${t.done ? "not done" : "done"}`}
                  className="size-4 accent-[var(--accent)]"
                />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${t.done ? "text-muted line-through" : ""}`}>{t.text}</span>
                  {t.dueDate && (
                    <span className={`text-xs ${overdue ? "text-danger" : "text-muted"}`}>
                      {overdue ? "Overdue · " : "Due "}
                      {t.dueDate.toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" })}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => run({ type: "delete", id: t.id }, () => deleteTask(t.id))}
                  disabled={t.id.startsWith("tmp-")}
                  className="text-muted opacity-0 transition hover:text-danger focus:opacity-100 group-hover:opacity-100"
                  aria-label={`Delete "${t.text}"`}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
