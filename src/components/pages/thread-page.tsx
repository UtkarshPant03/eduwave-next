import { Lock, Megaphone, Pin } from "lucide-react";
import { notFound } from "next/navigation";
import { reply } from "@/app/actions/community";
import { ActionForm } from "@/components/action-form";
import { ThreadModeration, DeletePostButton } from "@/components/client/thread-moderation";
import { Markdown } from "@/components/markdown";
import { Avatar, Badge, Card, Field, PageHeader, Textarea } from "@/components/ui";
import { courseForMember } from "@/lib/access";
import { requireUser } from "@/lib/auth/dal";
import { getThread } from "@/lib/data/community";
import { formatDateTime } from "@/lib/format";

export async function ThreadPage({ role, courseId, threadId }: { role: "student" | "instructor"; courseId: string; threadId: string }) {
  const user = await requireUser();
  const { course, manager } = await courseForMember(user, courseId);
  const { thread, replies } = await getThread(threadId);
  if (thread.courseId !== course.id) notFound();

  const roleTag = (r: string) => (r !== "student" ? <Badge tone="accent">Instructor</Badge> : null);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "My courses", href: `/${role}/courses` },
          { label: course.code, href: `/${role}/courses/${course.id}#discussions` },
          { label: "Discussion" },
        ]}
        title={thread.title}
        action={(manager || thread.authorId === user.id) && <ThreadModeration threadId={thread.id} manager={manager} pinned={thread.pinned} locked={thread.locked} />}
      />
      <div className="max-w-3xl space-y-4">
        <article className="rounded-2xl border border-border bg-surface p-5 shadow-card">
          <header className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <Avatar name={thread.author} size="sm" />
            <span className="font-medium">{thread.author}</span>
            {roleTag(thread.authorRole)}
            <span className="text-muted">· {formatDateTime(thread.createdAt)}</span>
            {thread.isAnnouncement && <Badge tone="accent"><Megaphone /> Announcement</Badge>}
            {thread.pinned && <Badge><Pin /> Pinned</Badge>}
            {thread.locked && <Badge><Lock /> Locked</Badge>}
          </header>
          <Markdown text={thread.body} className="prose-chat text-sm" />
        </article>

        <h2 className="pt-2 text-sm font-semibold text-muted">{replies.length} {replies.length === 1 ? "reply" : "replies"}</h2>
        <ol className="stagger space-y-3 border-l-2 border-border pl-4">
          {replies.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
              <header className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <Avatar name={r.author} size="sm" />
                <span className="font-medium">{r.author}</span>
                {roleTag(r.authorRole)}
                <span className="text-muted">· {formatDateTime(r.createdAt)}</span>
                {(manager || r.authorId === user.id) && <span className="ml-auto"><DeletePostButton threadId={thread.id} postId={r.id} /></span>}
              </header>
              <Markdown text={r.body} className="prose-chat text-sm" />
            </li>
          ))}
        </ol>

        {thread.locked ? (
          <p className="flex items-center gap-2 rounded-xl bg-surface-2 p-3 text-sm text-muted"><Lock className="size-4" /> This discussion is locked.</p>
        ) : (
          <Card title="Your reply">
            <ActionForm action={reply} submitLabel="Post reply">
              <input type="hidden" name="threadId" value={thread.id} />
              <Field label="Reply" hint="Supports **bold**, *italic*, `code`, lists and links.">
                <Textarea name="body" required rows={4} maxLength={20000} />
              </Field>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
