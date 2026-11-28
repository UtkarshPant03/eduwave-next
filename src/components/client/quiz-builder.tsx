"use client";

import { ArrowDown, ArrowUp, Copy, Dices, Library, Lock, Plus, Shuffle, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { aiDraftQuestions, createQuiz, updateQuiz } from "@/app/actions/instructor";
import { Badge, Button, Card, Field, FormMessage, Input, Select, Textarea } from "@/components/ui";
import { answerSummary, GRADING_METHOD_LABEL, GRADING_METHODS, MAX_ATTEMPTS, QUESTION_TYPE_LABEL, type GradingMethod } from "@/lib/questions";
import { GradeCategorySelect, type GradeCategoryChoice } from "./assignment-builder";
import { Dialog } from "./dialog";
import { LocalDateTimeInput } from "./local-datetime-input";
import { blankDraft, draftFromColumns, draftProblem, draftToInput, QuestionFields, type QuestionColumnsLike, type QuestionDraft } from "./question-fields";

type DraftQuestion = QuestionDraft & { kind: "question"; key: number; bankQuestionId: string | null };
type DraftSlot = { kind: "slot"; key: number; categoryId: string; pickCount: string; points: string };
type DraftItem = DraftQuestion | DraftSlot;

let nextKey = 1;
const blankQuestion = (): DraftQuestion => ({ ...blankDraft(), kind: "question", key: nextKey++, bankQuestionId: null });

export type BankCategory = { id: string; name: string; questions: number };
export type BankPick = QuestionColumnsLike & { id: string; categoryId: string; category: string; tags: string[] };

export type QuizInitial = {
  id: string;
  title: string;
  description: string | null;
  sectionId: string | null;
  timeLimitMinutes: number;
  deadline: string;
  opensAt: string | null;
  shuffle: boolean;
  maxAttempts: number;
  gradingMethod: GradingMethod;
  gradeCategoryId: string | null;
  questions: (QuestionColumnsLike & { position: number; bankQuestionId: string | null })[];
  slots: { position: number; categoryId: string; categoryName: string; pickCount: number; points: number }[];
  /** Questions each attempt is given (fixed + random picks). */
  questionCount: number;
  /** Students who have started: questions and the time limit are then locked. */
  attemptCount: number;
  /** Highest attempt number used: the attempt limit can't go below it. */
  attemptsUsed: number;
  /** The answer key is visible after the deadline, so a passed deadline is fixed. */
  deadlinePassed: boolean;
};

/** Creates a quiz, or with `initial` edits one (within the limits the server enforces). */
export function QuizBuilder({
  courseId,
  sections,
  aiAvailable,
  bank,
  initial,
  gradeCategories = { categories: [], weighted: false },
}: {
  courseId: string;
  sections: { id: string; title: string }[];
  aiAvailable: boolean;
  bank: { categories: BankCategory[]; questions: BankPick[] };
  initial?: QuizInitial;
  gradeCategories?: GradeCategoryChoice;
}) {
  const locked = (initial?.attemptCount ?? 0) > 0;
  const [items, setItems] = useState<DraftItem[]>(() => {
    if (!initial || initial.questions.length + initial.slots.length === 0) return [blankQuestion()];
    const qs: (DraftItem & { position: number })[] = initial.questions.map((q) => ({
      ...draftFromColumns(q),
      kind: "question" as const,
      key: nextKey++,
      bankQuestionId: q.bankQuestionId,
      position: q.position,
    }));
    const ss: (DraftItem & { position: number })[] = initial.slots.map((s) => ({
      kind: "slot" as const,
      key: nextKey++,
      categoryId: s.categoryId,
      pickCount: String(s.pickCount),
      points: String(s.points),
      position: s.position,
    }));
    // (A leftover `position` field is harmless: positions are recomputed from list order on save.)
    return [...qs, ...ss].sort((a, b) => a.position - b.position);
  });
  const [shuffle, setShuffle] = useState(initial?.shuffle ?? true);
  const [maxAttempts, setMaxAttempts] = useState(String(initial?.maxAttempts ?? 1));
  const [error, setError] = useState<string>();
  const [aiOpen, setAiOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const categoryById = useMemo(() => new Map(bank.categories.map((c) => [c.id, c])), [bank.categories]);

  const update = (i: number, patch: Partial<DraftQuestion> | Partial<DraftSlot>) =>
    setItems((xs) => xs.map((x, j) => (j === i ? ({ ...x, ...patch } as DraftItem) : x)));
  const move = (i: number, dir: -1 | 1) =>
    setItems((xs) => {
      const j = i + dir;
      if (j < 0 || j >= xs.length) return xs;
      const copy = [...xs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const perAttempt = locked && initial ? initial.questionCount : items.reduce((n, x) => n + (x.kind === "question" ? 1 : Number(x.pickCount) || 0), 0);
  const totalPoints = items.reduce((n, x) => n + (x.kind === "question" ? Number(x.points) || 0 : (Number(x.pickCount) || 0) * (Number(x.points) || 0)), 0);

  function problem(): { index: number; message: string } | null {
    for (const [i, x] of items.entries()) {
      if (x.kind === "question") {
        const p = draftProblem(x);
        if (p) return { index: i, message: `Question ${i + 1}: ${p}` };
      } else {
        const cat = categoryById.get(x.categoryId);
        const n = Number(x.pickCount);
        if (!cat) return { index: i, message: `Item ${i + 1}: choose a question bank category.` };
        if (!Number.isInteger(n) || n < 1) return { index: i, message: `Item ${i + 1}: pick at least 1 question.` };
        if (n > cat.questions) return { index: i, message: `Item ${i + 1}: "${cat.name}" has only ${cat.questions} question${cat.questions === 1 ? "" : "s"}.` };
      }
    }
    return null;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const deadlineLocal = String(form.get("deadline") ?? "");
    const opensLocal = String(form.get("opensAt") ?? "");
    const p = locked ? null : problem();
    if (p) {
      setError(p.message);
      document.getElementById(`item-${items[p.index].key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setError(undefined);
    startTransition(async () => {
      // On success the action redirects; we only get a value back on failure.
      const fields = {
        sectionId: String(form.get("sectionId") ?? ""),
        title: String(form.get("title")),
        description: String(form.get("description") ?? ""),
        // Disabled inputs aren't submitted, so locked fields keep their saved values.
        timeLimitMinutes: locked && initial ? initial.timeLimitMinutes : Number(form.get("timeLimitMinutes")),
        // datetime-local has no time zone; interpret it in the instructor's browser zone.
        deadline: initial?.deadlinePassed ? initial.deadline : deadlineLocal ? new Date(deadlineLocal).toISOString() : "",
        opensAt: opensLocal ? new Date(opensLocal).toISOString() : null,
        shuffle,
        maxAttempts: Number(maxAttempts),
        gradingMethod: String(form.get("gradingMethod") ?? "highest") as GradingMethod,
        // Not sent when the course has no gradebook categories (an edit then keeps the current one).
        gradeCategoryId: form.has("gradeCategoryId") ? String(form.get("gradeCategoryId")) : undefined,
      };
      const questions = items.flatMap((x, position) => (x.kind === "question" ? [{ ...draftToInput(x), position, bankQuestionId: x.bankQuestionId ?? undefined }] : []));
      const slots = items.flatMap((x, position) =>
        x.kind === "slot" ? [{ categoryId: x.categoryId, pickCount: Number(x.pickCount), points: Number(x.points), position }] : [],
      );
      const result = initial
        ? await updateQuiz({ id: initial.id, ...fields, ...(locked ? {} : { questions, slots }) })
        : await createQuiz({ courseId, ...fields, questions, slots });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card title="Details">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title"><Input name="title" required maxLength={160} defaultValue={initial?.title} placeholder="Quiz 1: Arrays and linked lists" /></Field>
          <Field label="Section">
            <Select name="sectionId" defaultValue={initial ? (initial.sectionId ?? "") : (sections[0]?.id ?? "")}>
              <option value="">General</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </Select>
          </Field>
          <Field label="Time limit (minutes)" hint={locked ? "Locked: students have started." : "Each attempt gets its own timer."}>
            <Input name="timeLimitMinutes" type="number" min={1} max={300} defaultValue={initial?.timeLimitMinutes ?? 20} required disabled={locked} />
          </Field>
          <Field
            label="Deadline"
            hint={initial?.deadlinePassed ? "Fixed: the deadline has passed and answers are visible." : "Students can't start after this; answers and explanations are revealed after it."}
          >
            <LocalDateTimeInput name="deadline" iso={initial?.deadline} required disabled={initial?.deadlinePassed} />
          </Field>
          <Field label="Opens (optional)" hint="Students can't start before this. Leave empty to open it right away.">
            <LocalDateTimeInput name="opensAt" iso={initial?.opensAt ?? undefined} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Attempts allowed" hint={initial && initial.attemptsUsed > 1 ? `At least ${initial.attemptsUsed} (already used).` : "1 = a single attempt."}>
              <Input
                name="maxAttempts"
                type="number"
                min={Math.max(1, initial?.attemptsUsed ?? 1)}
                max={MAX_ATTEMPTS}
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(e.target.value)}
                required
              />
            </Field>
            <Field label="Grade that counts" hint={Number(maxAttempts) > 1 ? "Used in the gradebook and exports." : "Only matters with 2+ attempts."}>
              <Select name="gradingMethod" defaultValue={initial?.gradingMethod ?? "highest"}>
                {GRADING_METHODS.map((m) => <option key={m} value={m}>{GRADING_METHOD_LABEL[m]}</option>)}
              </Select>
            </Field>
          </div>
        </div>
        {gradeCategories.categories.length > 0 && (
          <div className="mt-3 sm:w-1/2 sm:pr-1.5"><GradeCategorySelect choice={gradeCategories} current={initial?.gradeCategoryId ?? null} /></div>
        )}
        <div className="mt-3"><Field label="Instructions (optional)"><Input name="description" maxLength={2000} defaultValue={initial?.description ?? ""} placeholder="Closed book." /></Field></div>
        <label className="mt-4 flex items-center gap-3 text-sm">
          <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          <Shuffle className="size-4 text-muted" /> Shuffle question and option order for each student <span className="text-muted">(reduces copying)</span>
        </label>
        <p className="mt-3 text-xs text-muted">The attempt limit and which attempt counts are your course&apos;s choice: eduWave doesn&apos;t assume a university policy.</p>
      </Card>

      {locked && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            {initial?.attemptCount} student{initial?.attemptCount === 1 ? " has" : "s have"} started this quiz, so its {initial?.questionCount} questions
            and the time limit are locked: changing them now would make attempts unfair.{" "}
            {initial?.deadlinePassed ? "You can still edit the other details above." : "You can still edit the details above, extend the deadline and allow more attempts."}
          </p>
        </div>
      )}

      {!locked && (
        <div className="flex flex-wrap gap-3">
          {aiAvailable && (
            <div className="flex flex-1 flex-wrap items-center gap-3 rounded-2xl border border-accent/30 p-4 text-sm">
              <Sparkles className="size-5 text-accent" />
              <span className="flex-1">Paste lecture notes or a textbook passage and let the on-campus AI draft questions for you to review.</span>
              <Button type="button" variant="secondary" onClick={() => setAiOpen(true)}>Draft with AI</Button>
            </div>
          )}
          <div className="flex flex-1 flex-wrap items-center gap-3 rounded-2xl border border-border p-4 text-sm">
            <Library className="size-5 text-accent" />
            <span className="flex-1">
              {bank.questions.length
                ? `Reuse questions from this course's question bank (${bank.questions.length}). Each is copied into the quiz.`
                : "This course's question bank is empty. Add questions there to reuse them and to draw random questions."}
            </span>
            <a href={`/instructor/courses/${courseId}/bank`} target="_blank" rel="noreferrer" className="text-accent hover:underline">Open bank</a>
          </div>
        </div>
      )}

      {!locked && items.map((x, i) => (
        <Card
          key={x.key}
          title={x.kind === "question" ? `Question ${i + 1}` : `Random questions (item ${i + 1})`}
          action={
            <div className="flex items-center gap-1" id={`item-${x.key}`}>
              {x.kind === "question" && x.bankQuestionId && <Badge>From bank</Badge>}
              <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp /></IconBtn>
              <IconBtn label="Move down" onClick={() => move(i, 1)} disabled={i === items.length - 1}><ArrowDown /></IconBtn>
              {x.kind === "question" && (
                <IconBtn label="Duplicate" onClick={() => setItems((xs) => [...xs.slice(0, i + 1), { ...x, key: nextKey++ }, ...xs.slice(i + 1)])}><Copy /></IconBtn>
              )}
              <IconBtn label="Delete" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} disabled={items.length === 1} danger><Trash2 /></IconBtn>
            </div>
          }
        >
          {x.kind === "question" ? (
            <QuestionFields id={String(x.key)} draft={x} onChange={(patch) => update(i, patch)} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem]">
              <Field label="Category" hint="Each attempt draws its own questions when it starts.">
                <Select value={x.categoryId} onChange={(e) => update(i, { categoryId: e.target.value })} required>
                  <option value="">Choose…</option>
                  {bank.categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.questions})</option>)}
                </Select>
              </Field>
              <Field label="How many">
                <Input type="number" min={1} max={Math.max(1, categoryById.get(x.categoryId)?.questions ?? 50)} value={x.pickCount} onChange={(e) => update(i, { pickCount: e.target.value })} required />
              </Field>
              <Field label="Points each">
                <Input type="number" min={1} max={100} value={x.points} onChange={(e) => update(i, { points: e.target.value })} required />
              </Field>
            </div>
          )}
        </Card>
      ))}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-background/90 px-4 py-3">
        {!locked && (
          <>
            <Button type="button" variant="secondary" onClick={() => setItems((xs) => [...xs, blankQuestion()])}><Plus className="size-4" /> Add question</Button>
            <Button type="button" variant="secondary" onClick={() => setBankOpen(true)} disabled={bank.questions.length === 0}><Library className="size-4" /> Add from bank</Button>
            <Button
              type="button"
              variant="secondary"
              disabled={bank.categories.every((c) => c.questions === 0)}
              onClick={() => setItems((xs) => [...xs, { kind: "slot", key: nextKey++, categoryId: bank.categories.find((c) => c.questions > 0)?.id ?? "", pickCount: "1", points: "1" }])}
            >
              <Dices className="size-4" /> Add random questions
            </Button>
          </>
        )}
        <Button type="submit" disabled={pending}>
          {initial ? (pending ? "Saving…" : "Save changes") : pending ? "Publishing…" : `Publish quiz (${perAttempt} question${perAttempt === 1 ? "" : "s"})`}
        </Button>
        {!locked && <span className="text-xs text-muted tabular-nums">{totalPoints} point{totalPoints === 1 ? "" : "s"} per attempt</span>}
        <FormMessage state={{ error }} />
      </div>

      <Dialog open={aiOpen} onClose={() => setAiOpen(false)} title="Draft questions with AI" wide>
        <AiPanel
          courseId={courseId}
          onAdd={(drafts) => {
            setItems((xs) => [...xs.filter((x) => x.kind === "slot" || x.prompt.trim() !== ""), ...drafts]);
            setAiOpen(false);
            toast.success(`Added ${drafts.length} draft questions. Review each one before publishing.`);
          }}
        />
      </Dialog>
      <Dialog open={bankOpen} onClose={() => setBankOpen(false)} title="Add questions from the bank" wide>
        <BankPicker
          bank={bank}
          onAdd={(picked) => {
            const added: DraftQuestion[] = picked.map((q) => ({ ...draftFromColumns(q), kind: "question", key: nextKey++, bankQuestionId: q.id }));
            setItems((xs) => [...xs.filter((x) => x.kind === "slot" || x.prompt.trim() !== ""), ...added]);
            setBankOpen(false);
            toast.success(`Added ${added.length} question${added.length === 1 ? "" : "s"} from the bank. They are copies: editing them here doesn't change the bank.`);
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

function BankPicker({ bank, onAdd }: { bank: { categories: BankCategory[]; questions: BankPick[] }; onAdd: (q: BankPick[]) => void }) {
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const shown = bank.questions.filter((q) => !category || q.categoryId === category);
  return (
    <div className="space-y-3">
      <Field label="Category">
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {bank.categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.questions})</option>)}
        </Select>
      </Field>
      <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
        {shown.map((q) => (
          <li key={q.id}>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm hover:bg-surface-2">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-[var(--accent)]"
                checked={selected.has(q.id)}
                onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); return n; })}
              />
              <span className="min-w-0">
                <span className="block font-medium">{q.prompt}</span>
                <span className="mt-1 flex flex-wrap gap-1 text-xs text-muted">
                  <Badge>{q.category}</Badge>
                  <Badge>{QUESTION_TYPE_LABEL[q.type]}</Badge>
                  <Badge>{q.points} pt{q.points === 1 ? "" : "s"}</Badge>
                  <span className="truncate">Answer: {answerSummary(q)}</span>
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <Button type="button" disabled={selected.size === 0} onClick={() => onAdd(bank.questions.filter((q) => selected.has(q.id)))}>
        Add {selected.size} selected
      </Button>
    </div>
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
              // The AI drafts single-choice questions (1 point each).
              onAdd(
                res.questions.map((q) => ({
                  ...blankDraft("single"),
                  kind: "question" as const,
                  key: nextKey++,
                  bankQuestionId: null,
                  prompt: q.prompt,
                  options: q.options,
                  correctIndex: q.correctIndex,
                  explanation: q.explanation ?? "",
                })),
              );
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
