"use client";

import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { copyBankQuestions, deleteBankQuestion, deleteCategory, renameCategory, saveBankQuestion } from "@/app/actions/question-bank";
import { Badge, Button, Field, FormMessage, Input, Select } from "@/components/ui";
import { answerSummary, QUESTION_TYPE_LABEL } from "@/lib/questions";
import { Dialog } from "./dialog";
import { blankDraft, draftFromColumns, draftProblem, draftToInput, QuestionFields, type QuestionColumnsLike } from "./question-fields";

type Category = { id: string; name: string; questions: number };
export type BankItem = QuestionColumnsLike & { id: string; categoryId: string; tags: string[] };

/** Create or edit one bank question (category, tags and the question itself). */
function BankQuestionEditor({ courseId, categories, initial, onDone }: { courseId: string; categories: Category[]; initial?: BankItem; onDone: () => void }) {
  const [draft, setDraft] = useState(() => (initial ? draftFromColumns(initial) : blankDraft()));
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categories[0]?.id ?? "");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const problem = !categoryId ? "Choose a category." : draftProblem(draft);
        if (problem) return setError(problem);
        setError(undefined);
        start(async () => {
          const res = await saveBankQuestion({ courseId, id: initial?.id, categoryId, tags, question: draftToInput(draft) });
          if (res?.error) return setError(res.error);
          toast.success(res?.success ?? "Saved.");
          onDone();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Tags (optional)" hint="Comma separated, e.g. recursion, week 3">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} maxLength={400} />
        </Field>
      </div>
      <QuestionFields id={initial?.id ?? "new"} draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
      {initial && <p className="text-xs text-muted">Quizzes that already use this question keep their own copy; saving here doesn&apos;t change them.</p>}
      <FormMessage state={{ error }} />
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : initial ? "Save question" : "Add to bank"}</Button>
    </form>
  );
}

export function NewBankQuestion({ courseId, categories }: { courseId: string; categories: Category[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={categories.length === 0} title={categories.length === 0 ? "Create a category first" : undefined}>
        <Plus className="size-4" /> New question
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New bank question" wide>
        {open && <BankQuestionEditor courseId={courseId} categories={categories} onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}

export function BankQuestionActions({ courseId, categories, question }: { courseId: string; categories: Category[]; question: BankItem }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const short = question.prompt.length > 40 ? `${question.prompt.slice(0, 40)}…` : question.prompt;
  return (
    <span className="flex gap-1">
      <button type="button" aria-label={`Edit question: ${short}`} title="Edit" onClick={() => setOpen(true)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground">
        <Pencil className="size-4" />
      </button>
      <button
        type="button"
        aria-label={`Delete question: ${short}`}
        title="Delete"
        disabled={pending}
        onClick={() => {
          if (confirm("Delete this question from the bank? Quizzes that already use it keep their copy."))
            start(async () => {
              const res = await deleteBankQuestion(courseId, question.id);
              if (res.error) toast.error(res.error);
              else toast.success("Question deleted.");
            });
        }}
        className="grid size-8 place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 className="size-4" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Edit bank question" wide>
        {open && <BankQuestionEditor courseId={courseId} categories={categories} initial={question} onDone={() => setOpen(false)} />}
      </Dialog>
    </span>
  );
}

export function CategoryActions({ courseId, category }: { courseId: string; category: Category }) {
  const [pending, start] = useTransition();
  return (
    <span className="flex gap-1">
      <button
        type="button"
        aria-label={`Rename category ${category.name}`}
        title="Rename"
        disabled={pending}
        onClick={() => {
          const name = prompt("New name for this category", category.name);
          if (name && name.trim() !== category.name)
            start(async () => {
              const res = await renameCategory(courseId, category.id, name);
              if (res.error) toast.error(res.error);
              else toast.success("Category renamed.");
            });
        }}
        className="grid size-7 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
      >
        <Pencil className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={`Delete category ${category.name}`}
        title={category.questions ? "Only empty categories can be deleted" : "Delete"}
        disabled={pending || category.questions > 0}
        onClick={() =>
          start(async () => {
            const res = await deleteCategory(courseId, category.id);
            if (res.error) toast.error(res.error);
            else toast.success("Category deleted.");
          })
        }
        className="grid size-7 place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-30"
      >
        <Trash2 className="size-3.5" />
      </button>
    </span>
  );
}

/** Pick questions from another course's bank (same department) and copy them into ours. */
export function CopyFromBank({
  courseId,
  sourceCourseId,
  questions,
  ownCategories,
}: {
  courseId: string;
  sourceCourseId: string;
  questions: (BankItem & { category: string })[];
  ownCategories: Category[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categoryId, setCategoryId] = useState(ownCategories[0]?.id ?? "");
  const [state, setState] = useState<{ error?: string; success?: string }>();
  const [pending, start] = useTransition();
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {questions.map((q) => (
          <li key={q.id}>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm hover:bg-surface-2">
              <input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" checked={selected.has(q.id)} onChange={() => toggle(q.id)} aria-label={`Select: ${q.prompt}`} />
              <span className="min-w-0">
                <span className="block font-medium">{q.prompt}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">
                  <Badge>{q.category}</Badge>
                  <Badge>{QUESTION_TYPE_LABEL[q.type]}</Badge>
                  <Badge>{q.points} pt{q.points === 1 ? "" : "s"}</Badge>
                  {q.tags.map((t) => <Badge key={t} tone="accent">{t}</Badge>)}
                  <span className="truncate">Answer: {answerSummary(q)}</span>
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="sticky bottom-0 flex flex-wrap items-end gap-3 border-t border-border bg-background/90 py-3">
        <Field label="Copy into my category">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={ownCategories.length === 0}>
            {ownCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Button
          disabled={pending || selected.size === 0 || !categoryId}
          onClick={() =>
            start(async () => {
              const res = await copyBankQuestions({ courseId, sourceCourseId, categoryId, questionIds: [...selected] });
              setState(res);
              if (res?.success) {
                toast.success(res.success);
                setSelected(new Set());
              }
            })
          }
        >
          <Copy className="size-4" /> {pending ? "Copying…" : `Copy ${selected.size} selected`}
        </Button>
        {ownCategories.length === 0 && <p className="text-sm text-muted">Create a category in your own bank first.</p>}
        <FormMessage state={state?.error ? state : undefined} />
      </div>
    </div>
  );
}
