import { ListTodo } from "lucide-react";
import { listTasks } from "@/lib/data/shared";
import { requestTime } from "@/lib/format";
import { TaskListClient } from "./client/task-list";
import { Card } from "./ui";

/** Server wrapper: loads the tasks, the client component makes them interactive. */
export async function TaskList({ userId }: { userId: string }) {
  const tasks = await listTasks(userId);
  const today = new Date(requestTime()).toISOString().slice(0, 10);
  return (
    <Card title={<span className="flex items-center gap-2"><ListTodo className="size-4" /> My tasks</span>}>
      <TaskListClient tasks={tasks} today={today} />
    </Card>
  );
}
