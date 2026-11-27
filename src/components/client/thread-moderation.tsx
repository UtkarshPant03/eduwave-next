"use client";

import { Lock, LockOpen, Pin, PinOff, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { deletePost, deleteThread, moderateThread } from "@/app/actions/community";
import { Button } from "@/components/ui";

export function ThreadModeration({ threadId, manager, pinned, locked }: { threadId: string; manager: boolean; pinned: boolean; locked: boolean }) {
  const [pending, start] = useTransition();
  return (
    <>
      {manager && (
        <>
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => start(() => moderateThread(threadId, { pinned: !pinned }))}>
            {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />} {pinned ? "Unpin" : "Pin"}
          </Button>
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => start(() => moderateThread(threadId, { locked: !locked }))}>
            {locked ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />} {locked ? "Unlock" : "Lock"}
          </Button>
        </>
      )}
      <Button variant="danger" size="sm" disabled={pending} onClick={() => confirm("Delete this discussion and all replies?") && start(() => deleteThread(threadId))}>
        <Trash2 className="size-3.5" /> Delete
      </Button>
    </>
  );
}

export function DeletePostButton({ threadId, postId }: { threadId: string; postId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => confirm("Delete this reply?") && start(() => deletePost(threadId, postId))}
      className="grid size-7 place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger"
      aria-label="Delete reply"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}
