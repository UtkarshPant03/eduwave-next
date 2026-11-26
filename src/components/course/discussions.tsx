import { Lock, Megaphone, MessagesSquare, Pin } from "lucide-react";
import Link from "next/link";
import { createThread } from "@/app/actions/community";
import { ActionForm } from "@/components/action-form";
import { Avatar, Badge, Card, Empty, Field, Input, Textarea } from "@/components/ui";
import { listThreads } from "@/lib/data/community";
import { formatRelative } from "@/lib/format";

/** Thread list + "start a discussion" form, shared by students and instructors. */
export async function Discussions({ courseId, role, now }: { courseId: string; role: "student" | "instructor"; now: number }) {
  const threads = await listThreads(courseId);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Card title="Discussions" icon={<MessagesSquare />} description="Ask questions, share resources and help each other.">
        {threads.length === 0 ? (
          <Empty icon={<MessagesSquare />}>No discussions yet. Start the first one.</Empty>
        ) : (
          <ul className="stagger divide-y divide-border">
            {threads.map((t) => (
              <li key={t.id}>
                <Link href={`/${role}/courses/${courseId}/discussions/${t.id}`} className="group flex gap-3 py-3.5">
                  <Avatar name={t.author} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium group-hover:text-accent">
                      {t.isAnnouncement && <Badge tone="accent"><Megaphone /> Announcement</Badge>}
                      {t.pinned && !t.isAnnouncement && <Badge><Pin /> Pinned</Badge>}
                      {t.locked && <Badge><Lock /> Locked</Badge>}
                      <span className="truncate">{t.title}</span>
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-sm text-muted">{t.body}</p>
                    <p className="mt-1 text-xs text-muted">
                      {t.author}
                      {t.authorRole !== "student" && " (instructor)"} · {formatRelative(t.lastActivityAt, now)} · {t.replies} {t.replies === 1 ? "reply" : "replies"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={role === "instructor" ? "New post or announcement" : "Start a discussion"}>
        <ActionForm action={createThread} submitLabel="Post">
          <input type="hidden" name="courseId" value={courseId} />
          <Field label="Title"><Input name="title" required minLength={3} maxLength={200} /></Field>
          <Field label="Message" hint="Supports **bold**, *italic*, `code`, lists and links.">
            <Textarea name="body" required rows={6} maxLength={20000} />
          </Field>
          {role === "instructor" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="announcement" className="size-4 accent-[var(--accent)]" /> Post as announcement (pinned, notifies all students)
            </label>
          )}
        </ActionForm>
      </Card>
    </div>
  );
}
