"use client";

import { FileUp, Link2 } from "lucide-react";
import { useState } from "react";
import { addResource } from "@/app/actions/teacher";
import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui";

/** Share a link or upload a file (drag & drop), max 8 MB. */
export function ResourceForm({ classId, accept }: { classId: string; accept: string }) {
  const [kind, setKind] = useState<"file" | "link">("file");
  const [fileName, setFileName] = useState<string>();
  const [dragging, setDragging] = useState(false);

  return (
    <ActionForm action={addResource} submitLabel="Share with class">
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="kind" value={kind} />
      <div role="radiogroup" aria-label="Resource type" className="inline-flex w-fit rounded-lg border border-border p-0.5 text-sm">
        {(["file", "link"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 ${kind === k ? "bg-accent text-accent-foreground" : "text-muted"}`}
          >
            {k === "file" ? <FileUp className="size-3.5" /> : <Link2 className="size-3.5" />}
            {k === "file" ? "Upload file" : "Web link"}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title"><Input name="title" required maxLength={120} /></Field>
        <Field label="Subject"><Input name="subject" required maxLength={60} /></Field>
      </div>
      {kind === "link" ? (
        <Field label="URL"><Input name="url" type="url" placeholder="https://…" required /></Field>
      ) : (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={() => setDragging(false)}
          className={`relative grid cursor-pointer place-items-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm transition ${
            dragging ? "border-accent bg-accent/5" : "border-border hover:border-muted"
          }`}
        >
          <FileUp className="size-6 text-muted" />
          <span className="font-medium">{fileName ?? "Drop a file here or click to browse"}</span>
          <span className="text-xs text-muted">PDF, images, Word, PowerPoint, Excel, TXT or CSV · up to 8 MB</span>
          {/* The input covers the zone, so dropping onto it works natively. */}
          <input
            type="file"
            name="file"
            required
            accept={accept}
            onChange={(e) => setFileName(e.target.files?.[0]?.name)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      )}
    </ActionForm>
  );
}
