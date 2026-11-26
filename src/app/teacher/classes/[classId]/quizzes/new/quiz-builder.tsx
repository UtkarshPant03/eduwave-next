"use client";

import { useState, useTransition } from "react";
import { createQuiz } from "@/app/actions/teacher";
import { Button, Card, Field, FormMessage, Input } from "@/components/ui";

type DraftQuestion = { prompt: string; options: string[]; correctIndex: number };

const blankQuestion = (): DraftQuestion => ({ prompt: "", options: ["", "", "", ""], correctIndex: -1 });

export function QuizBuilder({ classId }: { classId: string }) {
  const [questions, setQuestions] = useState<DraftQuestion[]>([blankQuestion()]);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const update = (i: number, patch: Partial<DraftQuestion>) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const deadlineLocal = String(form.get("deadline") ?? "");
    if (questions.some((q) => q.correctIndex < 0)) {
      setError("Pick a correct option for every question.");
      return;
    }
    setError(undefined);
    startTransition(async () => {
      // On success the action redirects; we only get a value back on failure.
      const result = await createQuiz({
        classId,
        title: String(form.get("title")),
        subject: String(form.get("subject")),
        timeLimitMinutes: Number(form.get("timeLimitMinutes")),
        // datetime-local has no time zone; interpret it in the teacher's browser zone.
        deadline: deadlineLocal ? new Date(deadlineLocal).toISOString() : "",
        questions: questions.map((q) => ({ ...q, options: q.options.filter((o) => o.trim() !== "") })),
      });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card title="Details">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <Input name="title" required maxLength={120} />
          </Field>
          <Field label="Subject">
            <Input name="subject" required maxLength={60} />
          </Field>
          <Field label="Time limit (minutes)">
            <Input name="timeLimitMinutes" type="number" min={1} max={300} defaultValue={10} required />
          </Field>
          <Field label="Deadline" hint="Students can't start after this, and answers are revealed after it.">
            <Input name="deadline" type="datetime-local" required />
          </Field>
        </div>
      </Card>

      {questions.map((q, i) => (
        <Card
          key={i}
          title={`Question ${i + 1}`}
          action={
            questions.length > 1 && (
              <button
                type="button"
                className="text-sm text-muted hover:text-danger"
                onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            )
          }
        >
          <div className="grid gap-3">
            <Field label="Question">
              <Input value={q.prompt} onChange={(e) => update(i, { prompt: e.target.value })} required maxLength={500} />
            </Field>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Options (select the correct one)</legend>
              {q.options.map((opt, k) => (
                <div key={k} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${i}`}
                    checked={q.correctIndex === k}
                    onChange={() => update(i, { correctIndex: k })}
                    aria-label={`Option ${k + 1} is correct`}
                    className="size-4 accent-[var(--accent)]"
                  />
                  <Input
                    value={opt}
                    placeholder={`Option ${k + 1}${k >= 2 ? " (optional)" : ""}`}
                    required={k < 2}
                    maxLength={200}
                    onChange={(e) =>
                      update(i, { options: q.options.map((o, m) => (m === k ? e.target.value : o)) })
                    }
                  />
                </div>
              ))}
            </fieldset>
          </div>
        </Card>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={() => setQuestions((qs) => [...qs, blankQuestion()])}>
          Add question
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Publishing…" : "Publish quiz"}
        </Button>
        <FormMessage state={{ error }} />
      </div>
    </form>
  );
}
