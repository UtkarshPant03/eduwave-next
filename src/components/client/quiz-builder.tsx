"use client";

import { ArrowDown, ArrowUp, Copy, Plus, Shuffle, Sparkles, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { aiDraftQuestions, createQuiz } from "@/app/actions/instructor";
import { Button, Card, Field, FormMessage, Input, Select, Textarea } from "@/components/ui";
import { Dialog } from "./dialog";

type DraftQuestion = { key: number; prompt: string; options: string[]; correctIndex: number; explanation: string };

let nextKey = 1;
const blankQuestion = (): DraftQuestion => ({ key: nextKey++, prompt: "", options: ["", "", "", ""], correctIndex: -1, explanation: "" });

export function QuizBuilder({ courseId, sections, aiAvailable }: { courseId: string; sections: { id: string; title: string }[]; aiAvailable: boolean }) {
  const [questions, setQuestions] = useState<DraftQuestion[]>(() => [blankQuestion()]);
  const [shuffle, setShuffle] = useState(true);
  const [error, setError] = useState<string>();
  const [aiOpen, setAiOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const update = (i: number, patch: Partial<DraftQuestion>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, dir: -1 | 1) =>
    setQuestions((qs) => {
      const j = i + dir;
      if (j < 0 || j >= qs.length) return qs;
      const copy = [...qs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const deadlineLocal = String(form.get("deadline") ?? "");
    const missing = questions.findIndex((q) => q.correctIndex < 0);
    if (missing >= 0) {
      setError(`Pick the correct option for question ${missing + 1}.`);
      document.getElementById(`q-${questions[missing].key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setError(undefined);
    startTransition(async () => {
      // On success the action redirects; we only get a value back on failure.
      const result = await createQuiz({
        courseId,
        sectionId: String(form.get("sectionId") ?? ""),
        title: String(form.get("title")),
        description: String(form.get("description") ?? ""),
        timeLimitMinutes: Number(form.get("timeLimitMinutes")),
        // datetime-local has no time zone; interpret it in the instructor's browser zone.
        deadline: deadlineLocal ? new Date(deadlineLocal).toISOString() : "",
        shuffle,
        questions: questions.map((q) => {
          // Drop empty optional options, keeping the correct answer's index aligned.
          const kept = q.options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o !== "");
          return { prompt: q.prompt, options: kept.map((x) => x.o), correctIndex: kept.findIndex((x) => x.i === q.correctIndex), explanation: q.explanation.trim() || undefined };
        }),
      });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card title="Details">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title"><Input name="title" required maxLength={160} placeholder="Quiz 1: Arrays and linked lists" /></Field>
          <Field label="Section">
            <Select name="sectionId" defaultValue={sections[0]?.id ?? ""}>
              <option value="">General</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </Select>
          </Field>
          <Field label="Time limit (minutes)"><Input name="timeLimitMinutes" type="number" min={1} max={300} defaultValue={20} required /></Field>
          <Field label="Deadline" hint="Students can't start after this; answers and explanations are revealed after it.">
            <Input name="deadline" type="datetime-local" required />
          </Field>
        </div>
        <div className="mt-3"><Field label="Instructions (optional)"><Input name="description" maxLength={2000} placeholder="Closed book. One attempt." /></Field></div>
        <label className="mt-4 flex items-center gap-3 text-sm">
          <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          <Shuffle className="size-4 text-muted" /> Shuffle question and option order for each student <span className="text-muted">(reduces copying)</span>
        </label>
      </Card>

      {aiAvailable && (
        <div className="bg-mesh flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 p-4 text-sm">
          <Sparkles className="size-5 text-accent" />
          <span className="flex-1">Paste lecture notes or a textbook passage and let the on-campus AI draft questions for you to review.</span>
          <Button type="button" variant="secondary" onClick={() => setAiOpen(true)}>Draft with AI</Button>
        </div>
      )}

      {questions.map((q, i) => (
        <Card
          key={q.key}
          title={`Question ${i + 1}`}
          action={
            <div className="flex gap-1" id={`q-${q.key}`}>
              <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp /></IconBtn>
              <IconBtn label="Move down" onClick={() => move(i, 1)} disabled={i === questions.length - 1}><ArrowDown /></IconBtn>
              <IconBtn label="Duplicate" onClick={() => setQuestions((qs) => [...qs.slice(0, i + 1), { ...q, key: nextKey++ }, ...qs.slice(i + 1)])}><Copy /></IconBtn>
              <IconBtn label="Delete" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} disabled={questions.length === 1} danger><Trash2 /></IconBtn>
            </div>
          }
        >
          <div className="grid gap-3">
            <Field label="Question">
              <Textarea value={q.prompt} onChange={(e) => update(i, { prompt: e.target.value })} required maxLength={1000} rows={2} className="min-h-0" />
            </Field>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Options <span className="font-normal text-muted">(select the correct one)</span></legend>
              {q.options.map((opt, k) => (
                <div key={k} className={`flex items-center gap-2 rounded-xl p-1 transition ${q.correctIndex === k ? "bg-success/10" : ""}`}>
                  <input type="radio" name={`correct-${q.key}`} checked={q.correctIndex === k} onChange={() => update(i, { correctIndex: k })} aria-label={`Option ${k + 1} is correct`} className="size-4 accent-[var(--success)]" />
                  <Input
                    value={opt}
                    placeholder={`Option ${k + 1}${k >= 2 ? " (optional)" : ""}`}
                    required={k < 2 || q.correctIndex === k}
                    maxLength={300}
                    onChange={(e) => update(i, { options: q.options.map((o, m) => (m === k ? e.target.value : o)) })}
                  />
                </div>
              ))}
              {q.options.length < 6 && (
                <button type="button" onClick={() => update(i, { options: [...q.options, ""] })} className="w-fit text-xs text-accent hover:underline">+ Add option</button>
              )}
            </fieldset>
            <Field label="Explanation (optional)" hint="Shown to students with the answers after the deadline.">
              <Input value={q.explanation} onChange={(e) => update(i, { explanation: e.target.value })} maxLength={1000} />
            </Field>
          </div>
        </Card>
      ))}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-background/90 px-4 py-3 backdrop-blur">
        <Button type="button" variant="secondary" onClick={() => setQuestions((qs) => [...qs, blankQuestion()])}><Plus className="size-4" /> Add question</Button>
        <Button type="submit" disabled={pending}>{pending ? "Publishing…" : `Publish quiz (${questions.length} question${questions.length === 1 ? "" : "s"})`}</Button>
        <FormMessage state={{ error }} />
      </div>

      <Dialog open={aiOpen} onClose={() => setAiOpen(false)} title="Draft questions with AI" wide>
        <AiPanel
          courseId={courseId}
          onAdd={(drafts) => {
            setQuestions((qs) => [...qs.filter((q) => q.prompt.trim() !== ""), ...drafts]);
            setAiOpen(false);
            toast.success(`Added ${drafts.length} draft questions. Review each one before publishing.`);
          }}
        />
      </Dialog>
    </form>
  );
}

function IconBtn({ label, children, danger, ...props }: React.ComponentProps<"button"> & { label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`grid size-8 place-items-center rounded-lg text-muted disabled:opacity-30 [&>svg]:size-4 ${danger ? "hover:bg-danger/10 hover:text-danger" : "hover:bg-surface-2 hover:text-foreground"}`}
      {...props}
    >
      {children}
    </button>
  );
}

function AiPanel({ courseId, onAdd }: { courseId: string; onAdd: (q: DraftQuestion[]) => void }) {
  const [material, setMaterial] = useState("");
  const [count, setCount] = useState(5);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <Textarea value={material} onChange={(e) => setMaterial(e.target.value)} rows={10} maxLength={12000} placeholder="Paste a passage, lecture notes or a summary (at least a paragraph)…" />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">Questions <Input type="number" min={1} max={15} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-20" /></label>
        <Button
          type="button"
          disabled={pending || material.trim().length < 50}
          onClick={() =>
            startTransition(async () => {
              setError(undefined);
              const res = await aiDraftQuestions({ courseId, material, count });
              if (res.error || !res.questions) return setError(res.error ?? "No questions returned.");
              onAdd(res.questions.map((q) => ({ key: nextKey++, prompt: q.prompt, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation ?? "" })));
            })
          }
        >
          <Sparkles className="size-4" /> {pending ? "Thinking… (can take a minute)" : "Generate drafts"}
        </Button>
      </div>
      <FormMessage state={{ error }} />
      <p className="text-xs text-muted">Runs on your institution&apos;s own server via Ollama. Small models make mistakes: check every question and answer.</p>
    </div>
  );
}
