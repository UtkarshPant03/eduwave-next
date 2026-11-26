"use client";

import { Check, CloudOff, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { renameBoard, saveBoard, shareBoard } from "@/app/actions/boards";
import type { Scene } from "./excalidraw-canvas";

// Excalidraw touches `window`, so it must only load in the browser.
const ExcalidrawCanvas = dynamic(() => import("./excalidraw-canvas"), {
  ssr: false,
  loading: () => <div className="grid flex-1 place-items-center rounded-xl border border-border text-sm text-muted">Loading whiteboard…</div>,
});

const SAVE_DELAY_MS = 1500;

export function BoardEditor({
  boardId,
  title,
  initialScene,
  readOnly,
  classes,
  sharedClassId,
}: {
  boardId: string;
  title: string;
  initialScene: Scene;
  readOnly: boolean;
  classes: { id: string; name: string }[];
  sharedClassId: string | null;
}) {
  const [status, setStatus] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [share, setShare] = useState(sharedClassId ?? "");
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastVersion = useRef<number | null>(null);

  function onSceneChange(scene: Scene, version: number) {
    if (readOnly) return;
    // onChange also fires for pointer moves/selection; only save when elements changed.
    if (lastVersion.current === null) {
      lastVersion.current = version;
      return;
    }
    if (version === lastVersion.current) return;
    lastVersion.current = version;
    setStatus("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setStatus("saving");
      const res = await saveBoard({ boardId, elements: scene.elements, files: scene.files });
      setStatus(res.ok ? "saved" : "error");
      if (!res.ok) toast.error(res.error ?? "Couldn't save the board.");
    }, SAVE_DELAY_MS);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <input
          defaultValue={title}
          disabled={readOnly}
          aria-label="Board title"
          maxLength={80}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== title) startTransition(() => renameBoard(boardId, v));
          }}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-xl font-semibold hover:border-border focus:border-border focus:outline-none disabled:hover:border-transparent"
        />
        {!readOnly && classes.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted">
            Share with
            <select
              value={share}
              onChange={(e) => {
                setShare(e.target.value);
                startTransition(async () => {
                  await shareBoard(boardId, e.target.value || null);
                  toast.success(e.target.value ? "Board shared (view only) with the class." : "Board is now private.");
                });
              }}
              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
            >
              <option value="">Nobody (private)</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
        {!readOnly && (
          <span className="flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
            {status === "saved" && <><Check className="size-3.5 text-success" /> Saved</>}
            {status === "pending" && "Unsaved changes"}
            {status === "saving" && <><Loader2 className="size-3.5 animate-spin" /> Saving…</>}
            {status === "error" && <><CloudOff className="size-3.5 text-danger" /> Not saved</>}
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
        <ExcalidrawCanvas initialScene={initialScene} readOnly={readOnly} onSceneChange={onSceneChange} />
      </div>
    </>
  );
}
