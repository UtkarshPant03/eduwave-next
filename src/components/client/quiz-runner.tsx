"use client";

import { ChevronLeft, ChevronRight, Keyboard, Maximize2, Minimize2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveAnswer, submitAttempt, type SaveAnswerResult } from "@/app/actions/student";
import { Button, Card, Input } from "@/components/ui";
import type { QuestionType } from "@/lib/questions";

/** What the browser gets for a question during an attempt: never any part of the answer key. */
export type RunnerQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  options: string[];
  response: { selectedIndex: number | null; selectedIndexes: number[] | null; text: string | null; number: number | null };
};

/** One draft answer per question, in the shape the inputs edit. */
type Draft = { index?: number; indexes?: number[]; text?: string };

const isChoice = (t: QuestionType) => t === "single" || t === "true_false";

function initialDraft(q: RunnerQuestion): Draft | undefined {
  const r = q.response;
  if (isChoice(q.type) && r.selectedIndex != null) return { index: r.selectedIndex };
  if (q.type === "multiple" && r.selectedIndexes?.length) return { indexes: r.selectedIndexes };
  if (q.type === "short_answer" && r.text) return { text: r.text };
  if (q.type === "numerical" && r.number != null) return { text: String(r.number) };
  return undefined;
}

function answered(q: RunnerQuestion, d: Draft | undefined) {
  if (!d) return false;
  if (isChoice(q.type)) return d.index != null;
  if (q.type === "multiple") return (d.indexes?.length ?? 0) > 0;
  return (d.text ?? "").trim() !== "";
}

/** Accepts "3.5", "3,5", "-2", "1e3". Returns undefined for text that isn't a number. */
function parseNumber(s: string): number | null | undefined {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Runs an in-progress attempt. The countdown here is only a display: the server
 * decides when the attempt closes (see lib/quiz-engine.ts), so changing this code or
 * the device clock cannot buy extra time. Option indexes are display positions; the
 * server maps them back to the original options using this attempt's stored layout.
 */
export function QuizRunner({ quizId, questions, endsAtMs, serverNowMs, totalMs }: { quizId: string; questions: RunnerQuestion[]; endsAtMs: number; serverNowMs: number; totalMs: number }) {
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft | undefined>>(() => Object.fromEntries(questions.map((q) => [q.id, initialDraft(q)])));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error" | "badnumber">("idle");
  const [submitting, startSubmit] = useTransition();
  const remaining = useCountdown(endsAtMs, serverNowMs);
  const submittedRef = useRef(false);
  const warned = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // A typed answer waiting for its debounce: sent before the attempt is submitted.
  const pendingSend = useRef<(() => Promise<void>) | undefined>(undefined);

  const submit = useCallback(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    clearTimeout(typingTimer.current);
    const flush = pendingSend.current;
    pendingSend.current = undefined;
    startSubmit(async () => {
      await flush?.();
      await submitAttempt(quizId);
    });
  }, [quizId]);

  // Auto-submit at zero, and a one-time warning at one minute left.
  useEffect(() => {
    if (remaining <= 0) submit();
    else if (remaining < 60_000 && !warned.current) {
      warned.current = true;
      toast.warning("1 minute left! Your answers are saved automatically.");
    }
  }, [remaining, submit]);

  const persist = useCallback(
    async (payload: Parameters<typeof saveAnswer>[0]) => {
      setSaveState("saving");
      try {
        const result: SaveAnswerResult = await saveAnswer(payload);
        if (result.ok) setSaveState("saved");
        else if (result.reason === "closed") submit();
        else setSaveState("error");
      } catch {
        setSaveState("error");
      }
    },
    [submit],
  );

  const choose = useCallback(
    (q: RunnerQuestion, displayIndex: number) => {
      if (q.type === "multiple") {
        const current = drafts[q.id]?.indexes ?? [];
        const next = current.includes(displayIndex) ? current.filter((i) => i !== displayIndex) : [...current, displayIndex].sort((a, b) => a - b);
        setDrafts((d) => ({ ...d, [q.id]: { indexes: next } }));
        void persist({ quizId, questionId: q.id, displayIndexes: next });
      } else {
        setDrafts((d) => ({ ...d, [q.id]: { index: displayIndex } }));
        void persist({ quizId, questionId: q.id, displayIndex });
      }
    },
    [drafts, persist, quizId],
  );

  /** Typed answers are saved shortly after the student stops typing (and on leaving the field). */
  const type = useCallback(
    (q: RunnerQuestion, text: string, immediate = false) => {
      setDrafts((d) => ({ ...d, [q.id]: { text } }));
      clearTimeout(typingTimer.current);
      const send = async () => {
        pendingSend.current = undefined;
        if (q.type === "numerical") {
          const n = parseNumber(text);
          if (n === undefined) return setSaveState("badnumber");
          await persist({ quizId, questionId: q.id, number: n });
        } else {
          await persist({ quizId, questionId: q.id, text });
        }
      };
      pendingSend.current = send;
      if (immediate) void send();
      else typingTimer.current = setTimeout(() => void send(), 700);
    },
    [persist, quizId],
  );

  const q = questions[index];

  // Keyboard: 1-6 pick an option, ←/→ move between questions (not while typing an answer).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== "radio" && e.target.type !== "checkbox") return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, questions.length - 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
      else if (q.options.length && /^[1-6]$/.test(e.key) && Number(e.key) <= q.options.length && !submittedRef.current) choose(q, Number(e.key) - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q, questions.length, choose]);

  const answeredCount = questions.filter((qq) => answered(qq, drafts[qq.id])).length;
  const pct = remaining / totalMs;
  const timeTone = pct < 0.1 ? "text-danger" : pct < 0.25 ? "text-warning" : "";
  const firstUnanswered = questions.findIndex((qq) => !answered(qq, drafts[qq.id]));
  const draft = drafts[q.id];

  function trySubmit() {
    const unanswered = questions.length - answeredCount;
    if (unanswered === 0 || confirm(`${unanswered} question(s) unanswered. Submit anyway?`)) submit();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_17rem] [&>*]:min-w-0">
      <Card className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1 bg-surface-2" aria-hidden>
          <div className={`h-full transition-[width] duration-500 ${pct < 0.1 ? "bg-danger" : pct < 0.25 ? "bg-warning" : "bg-brand"}`} style={{ width: `${pct * 100}%` }} />
        </div>
        <div className="flex items-center justify-between text-sm text-muted">
          <span>Question {index + 1} of {questions.length}{q.points !== 1 ? ` · ${q.points} points` : ""}</span>
          {q.options.length > 0 && <span className="hidden items-center gap-1 text-xs sm:flex"><Keyboard className="size-3.5" /> 1–{q.options.length} to answer · ← → to move</span>}
        </div>
        <h2 key={q.id} className="mt-3 text-lg font-medium leading-snug">{q.prompt}</h2>
        {q.type === "multiple" && <p className="mt-1 text-sm text-muted">Select all that apply. All-or-nothing: you get the points only if you pick exactly the correct options.</p>}
        <fieldset className="mt-5 grid gap-2" disabled={submitting}>
          <legend className="sr-only">{q.options.length ? "Options" : "Your answer"}</legend>
          {q.options.map((opt, k) => {
            const isPicked = q.type === "multiple" ? (draft?.indexes ?? []).includes(k) : draft?.index === k;
            return (
              <label
                key={`${q.id}-${k}`}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                  isPicked ? "border-accent bg-accent/10 shadow-sm" : "border-border hover:border-muted hover:bg-surface-2"
                }`}
              >
                <input type={q.type === "multiple" ? "checkbox" : "radio"} name={`q-${q.id}`} checked={isPicked} onChange={() => choose(q, k)} className="sr-only" />
                <span aria-hidden className={`grid size-7 shrink-0 place-items-center ${q.type === "multiple" ? "rounded-md" : "rounded-lg"} border text-xs font-semibold ${isPicked ? "bg-brand border-transparent text-white" : "border-border text-muted"}`}>
                  {k + 1}
                </span>
                <span>{opt}</span>
              </label>
            );
          })}
          {(q.type === "short_answer" || q.type === "numerical") && (
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{q.type === "numerical" ? "Your answer (a number)" : "Your answer"}</span>
              <Input
                key={q.id}
                value={draft?.text ?? ""}
                inputMode={q.type === "numerical" ? "decimal" : "text"}
                maxLength={q.type === "numerical" ? 40 : 500}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => type(q, e.target.value)}
                onBlur={(e) => type(q, e.target.value, true)}
              />
              {q.type === "short_answer" && <span className="text-xs text-muted">Capital letters and extra spaces don&apos;t matter.</span>}
            </label>
          )}
        </fieldset>
        <div className="mt-6 flex items-center justify-between">
          <Button variant="secondary" onClick={() => setIndex((i) => i - 1)} disabled={index === 0}><ChevronLeft className="size-4" /> Previous</Button>
          <span className="text-xs text-muted" aria-live="polite">
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && "Saved"}
            {saveState === "error" && <span className="text-danger">Couldn&apos;t save. Check your connection and try again.</span>}
            {saveState === "badnumber" && <span className="text-danger">Enter a number, e.g. 3.5</span>}
          </span>
          {index < questions.length - 1 ? (
            <Button variant="secondary" onClick={() => setIndex((i) => i + 1)}>Next <ChevronRight className="size-4" /></Button>
          ) : (
            <Button onClick={trySubmit} disabled={submitting}>Finish</Button>
          )}
        </div>
      </Card>

      <aside className="space-y-4">
        <Card>
          <p className="text-sm text-muted">Time left</p>
          <p className={`mt-1 text-4xl font-semibold tabular-nums ${timeTone}`}>{formatClock(remaining)}</p>
        </Card>
        <Card>
          <p className="mb-3 text-sm text-muted">{answeredCount} of {questions.length} answered</p>
          <div className="grid grid-cols-5 gap-2">
            {questions.map((qq, i) => {
              const done = answered(qq, drafts[qq.id]);
              return (
                <button
                  key={qq.id}
                  onClick={() => setIndex(i)}
                  aria-label={`Go to question ${i + 1}${done ? " (answered)" : ""}`}
                  aria-current={i === index ? "step" : undefined}
                  className={`aspect-square rounded-lg border text-sm tabular-nums transition ${i === index ? "border-accent font-semibold ring-2 ring-accent/30" : "border-border"} ${done ? "bg-accent/15" : "hover:bg-surface-2"}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          {firstUnanswered >= 0 && (
            <button onClick={() => setIndex(firstUnanswered)} className="mt-3 text-xs text-accent hover:underline">Jump to first unanswered →</button>
          )}
          <Button className="mt-4 w-full" disabled={submitting} onClick={trySubmit}>{submitting ? "Submitting…" : "Submit"}</Button>
        </Card>
        <FocusToggle />
      </aside>
    </div>
  );
}

/** Counts down using the server's clock (corrected for device clock skew). */
function useCountdown(endsAtMs: number, serverNowMs: number) {
  const [skew] = useState(() => serverNowMs - Date.now());
  const [remaining, setRemaining] = useState(() => endsAtMs - serverNowMs);
  useEffect(() => {
    const id = setInterval(() => setRemaining(endsAtMs - (Date.now() + skew)), 500);
    return () => clearInterval(id);
  }, [endsAtMs, skew]);
  return Math.max(remaining, 0);
}

function formatClock(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Opt-in fullscreen focus mode. */
function FocusToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  return (
    <Button variant="secondary" className="w-full" onClick={() => (on ? document.exitFullscreen() : document.documentElement.requestFullscreen())}>
      {on ? <><Minimize2 className="size-4" /> Exit focus mode</> : <><Maximize2 className="size-4" /> Focus mode</>}
    </Button>
  );
}
