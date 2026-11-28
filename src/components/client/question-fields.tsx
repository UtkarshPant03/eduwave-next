"use client";

/**
 * Editor for one question of any type, shared by the quiz builder and the question bank.
 * Holds a loose draft (strings while typing); draftToInput turns it into the shape the
 * server validates (src/lib/questions.ts), and draftProblem gives a friendly message first.
 */
import { Field, Input, Select, Textarea } from "@/components/ui";
import { QUESTION_TYPE_LABEL, QUESTION_TYPES, TRUE_FALSE_OPTIONS, type QuestionInput, type QuestionType } from "@/lib/questions";

export type QuestionDraft = {
  type: QuestionType;
  prompt: string;
  options: string[];
  correctIndex: number; // -1 = none chosen yet
  correctIndexes: number[];
  accepted: string[];
  numericAnswer: string;
  tolerance: string;
  points: string;
  explanation: string;
};

export type QuestionColumnsLike = {
  type: QuestionType;
  prompt: string;
  options: string[];
  correctIndex: number | null;
  correctIndexes: number[] | null;
  acceptedAnswers: string[] | null;
  numericAnswer: number | null;
  tolerance: number | null;
  points: number;
  explanation: string | null;
};

export const blankDraft = (type: QuestionType = "single"): QuestionDraft => ({
  type,
  prompt: "",
  options: ["", "", "", ""],
  correctIndex: -1,
  correctIndexes: [],
  accepted: [""],
  numericAnswer: "",
  tolerance: "0",
  points: "1",
  explanation: "",
});

export function draftFromColumns(q: QuestionColumnsLike): QuestionDraft {
  const choice = q.type === "single" || q.type === "multiple";
  return {
    ...blankDraft(q.type),
    prompt: q.prompt,
    options: choice ? [...q.options] : ["", "", "", ""],
    correctIndex: q.correctIndex ?? -1,
    correctIndexes: q.correctIndexes ?? [],
    accepted: q.acceptedAnswers?.length ? [...q.acceptedAnswers] : [""],
    numericAnswer: q.numericAnswer == null ? "" : String(q.numericAnswer),
    tolerance: q.tolerance == null ? "0" : String(q.tolerance),
    points: String(q.points),
    explanation: q.explanation ?? "",
  };
}

const num = (s: string) => {
  const t = s.trim().replace(",", ".");
  return t === "" ? null : Number.isFinite(Number(t)) ? Number(t) : NaN;
};

/** A message for the first thing that's missing, or null when the draft can be sent. */
export function draftProblem(d: QuestionDraft): string | null {
  if (!d.prompt.trim()) return "Write the question.";
  const points = Number(d.points);
  if (!Number.isInteger(points) || points < 1 || points > 100) return "Points must be a whole number from 1 to 100.";
  const kept = d.options.map((o) => o.trim()).filter(Boolean);
  switch (d.type) {
    case "single":
      if (kept.length < 2) return "Add at least 2 options.";
      if (d.correctIndex < 0 || !d.options[d.correctIndex]?.trim()) return "Pick the correct option.";
      return null;
    case "multiple":
      if (kept.length < 2) return "Add at least 2 options.";
      if (!d.correctIndexes.some((i) => d.options[i]?.trim())) return "Tick at least one correct option.";
      return null;
    case "true_false":
      return d.correctIndex === 0 || d.correctIndex === 1 ? null : "Choose whether the statement is true or false.";
    case "short_answer":
      return d.accepted.some((a) => a.trim()) ? null : "Add at least one accepted answer.";
    case "numerical": {
      const v = num(d.numericAnswer);
      const t = num(d.tolerance);
      if (v == null || Number.isNaN(v)) return "Enter the correct number.";
      if (t == null || Number.isNaN(t) || t < 0) return "Tolerance must be 0 or more.";
      return null;
    }
  }
}

/** The server payload. Empty optional options are dropped, keeping the answer key aligned. */
export function draftToInput(d: QuestionDraft): QuestionInput {
  const kept = d.options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o !== "");
  const newIndex = (i: number) => kept.findIndex((x) => x.i === i);
  const base = { type: d.type, prompt: d.prompt, points: Number(d.points), explanation: d.explanation.trim() || undefined };
  switch (d.type) {
    case "single":
      return { ...base, options: kept.map((x) => x.o), correctIndex: newIndex(d.correctIndex) };
    case "multiple":
      return { ...base, options: kept.map((x) => x.o), correctIndexes: d.correctIndexes.map(newIndex).filter((i) => i >= 0) };
    case "true_false":
      return { ...base, options: [...TRUE_FALSE_OPTIONS], correctIndex: d.correctIndex };
    case "short_answer":
      return { ...base, options: [], acceptedAnswers: d.accepted.map((a) => a.trim()).filter(Boolean) };
    case "numerical":
      return { ...base, options: [], numericAnswer: num(d.numericAnswer) ?? 0, tolerance: num(d.tolerance) ?? 0 };
  }
}

/** Edits one question draft. `id` keeps radio groups and labels unique on the page. */
export function QuestionFields({ id, draft, onChange }: { id: string; draft: QuestionDraft; onChange: (patch: Partial<QuestionDraft>) => void }) {
  const d = draft;
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Field label="Question type">
          <Select value={d.type} onChange={(e) => onChange({ type: e.target.value as QuestionType, correctIndex: -1, correctIndexes: [] })}>
            {QUESTION_TYPES.map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>)}
          </Select>
        </Field>
        <Field label="Points">
          <Input type="number" min={1} max={100} step={1} value={d.points} onChange={(e) => onChange({ points: e.target.value })} required />
        </Field>
      </div>
      <Field label={d.type === "true_false" ? "Statement" : "Question"}>
        <Textarea value={d.prompt} onChange={(e) => onChange({ prompt: e.target.value })} required maxLength={1000} rows={2} className="min-h-0" />
      </Field>

      {(d.type === "single" || d.type === "multiple") && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">
            Options{" "}
            <span className="font-normal text-muted">
              {d.type === "single" ? "(select the correct one)" : "(tick every correct one; scored all-or-nothing: no partial credit)"}
            </span>
          </legend>
          {d.options.map((opt, k) => {
            const isCorrect = d.type === "single" ? d.correctIndex === k : d.correctIndexes.includes(k);
            return (
              <div key={k} className={`flex items-center gap-2 rounded-xl p-1 transition ${isCorrect ? "bg-success/10" : ""}`}>
                <input
                  type={d.type === "single" ? "radio" : "checkbox"}
                  name={`correct-${id}`}
                  checked={isCorrect}
                  onChange={() =>
                    d.type === "single"
                      ? onChange({ correctIndex: k })
                      : onChange({ correctIndexes: isCorrect ? d.correctIndexes.filter((i) => i !== k) : [...d.correctIndexes, k].sort((a, b) => a - b) })
                  }
                  aria-label={`Option ${k + 1} is correct`}
                  className="size-4 accent-[var(--success)]"
                />
                <Input
                  value={opt}
                  placeholder={`Option ${k + 1}${k >= 2 ? " (optional)" : ""}`}
                  aria-label={`Option ${k + 1}`}
                  required={k < 2 || isCorrect}
                  maxLength={300}
                  onChange={(e) => onChange({ options: d.options.map((o, m) => (m === k ? e.target.value : o)) })}
                />
              </div>
            );
          })}
          {d.options.length < 6 && (
            <button type="button" onClick={() => onChange({ options: [...d.options, ""] })} className="w-fit text-xs text-accent hover:underline">+ Add option</button>
          )}
        </fieldset>
      )}

      {d.type === "true_false" && (
        <fieldset className="flex flex-wrap gap-3">
          <legend className="mb-1 text-sm font-medium">The statement is…</legend>
          {TRUE_FALSE_OPTIONS.map((label, k) => (
            <label key={label} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${d.correctIndex === k ? "border-success/50 bg-success/10" : "border-border"}`}>
              <input type="radio" name={`correct-${id}`} checked={d.correctIndex === k} onChange={() => onChange({ correctIndex: k })} className="size-4 accent-[var(--success)]" />
              {label}
            </label>
          ))}
        </fieldset>
      )}

      {d.type === "short_answer" && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">
            Accepted answers <span className="font-normal text-muted">(exact match after trimming; capital letters and repeated spaces are ignored)</span>
          </legend>
          {d.accepted.map((a, k) => (
            <Input
              key={k}
              value={a}
              placeholder={`Accepted answer ${k + 1}`}
              aria-label={`Accepted answer ${k + 1}`}
              maxLength={200}
              required={k === 0}
              onChange={(e) => onChange({ accepted: d.accepted.map((x, m) => (m === k ? e.target.value : x)) })}
            />
          ))}
          {d.accepted.length < 20 && (
            <button type="button" onClick={() => onChange({ accepted: [...d.accepted, ""] })} className="w-fit text-xs text-accent hover:underline">+ Add accepted answer</button>
          )}
        </fieldset>
      )}

      {d.type === "numerical" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Correct value">
            <Input inputMode="decimal" value={d.numericAnswer} onChange={(e) => onChange({ numericAnswer: e.target.value })} required placeholder="e.g. 9.81" />
          </Field>
          <Field label="Tolerance (±)" hint="Answers within this distance of the value are correct. 0 = exact.">
            <Input inputMode="decimal" value={d.tolerance} onChange={(e) => onChange({ tolerance: e.target.value })} required />
          </Field>
        </div>
      )}

      <Field label="Explanation (optional)" hint="Shown to students with the answers after the deadline.">
        <Input value={d.explanation} onChange={(e) => onChange({ explanation: e.target.value })} maxLength={1000} />
      </Field>
    </div>
  );
}
