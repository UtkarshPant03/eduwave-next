"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveAnswer, submitAttempt } from "@/app/actions/student";
import { Button, Card } from "@/components/ui";

type Question = { id: string; prompt: string; options: string[]; selectedIndex: number | null };

/**
 * Runs an in-progress attempt. The countdown here is only a display: the server
 * decides when the attempt closes (see lib/quiz-engine.ts), so changing this
 * code or the device clock cannot buy extra time.
 */
export function QuizRunner({
  quizId,
  questions,
  endsAtMs,
  serverNowMs,
}: {
  quizId: string;
  questions: Question[];
  endsAtMs: number;
  serverNowMs: number;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Record<string, number>>(() =>
    Object.fromEntries(questions.filter((q) => q.selectedIndex != null).map((q) => [q.id, q.selectedIndex!])),
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitting, startSubmit] = useTransition();
  const remaining = useCountdown(endsAtMs, serverNowMs);
  const submittedRef = useRef(false);

  const submit = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    startSubmit(() => submitAttempt(quizId));
  };

  // Auto-submit when the countdown hits zero.
  useEffect(() => {
    if (remaining <= 0) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining <= 0]);

  async function choose(questionId: string, optionIndex: number) {
    setSelected((s) => ({ ...s, [questionId]: optionIndex }));
    setSaveState("saving");
    try {
      const result = await saveAnswer({ quizId, questionId, selectedIndex: optionIndex });
      if (result.ok) setSaveState("saved");
      else if (result.reason === "closed") submit();
      else setSaveState("error");
    } catch {
      setSaveState("error");
    }
  }

  const q = questions[index];
  const answeredCount = Object.keys(selected).length;
  const lowTime = remaining < 60_000;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
      <Card>
        <p className="text-sm text-muted">
          Question {index + 1} of {questions.length}
        </p>
        <h2 className="mt-2 text-lg font-medium">{q.prompt}</h2>
        <fieldset className="mt-5 grid gap-2" disabled={submitting}>
          <legend className="sr-only">Options</legend>
          {q.options.map((opt, k) => {
            const isPicked = selected[q.id] === k;
            return (
              <label
                key={k}
                className={`flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-sm transition ${
                  isPicked ? "border-accent bg-accent/10" : "border-border hover:border-muted"
                }`}
              >
                <input
                  type="radio"
                  name={`q-${q.id}`}
                  checked={isPicked}
                  onChange={() => choose(q.id, k)}
                  className="size-4 accent-[var(--accent)]"
                />
                {opt}
              </label>
            );
          })}
        </fieldset>
        <div className="mt-6 flex items-center justify-between">
          <Button variant="secondary" onClick={() => setIndex((i) => i - 1)} disabled={index === 0}>
            Previous
          </Button>
          <span className="text-xs text-muted" aria-live="polite">
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && "Saved"}
            {saveState === "error" && "Couldn't save. Check your connection and pick again."}
          </span>
          <Button variant="secondary" onClick={() => setIndex((i) => i + 1)} disabled={index === questions.length - 1}>
            Next
          </Button>
        </div>
      </Card>

      <aside className="space-y-4">
        <Card>
          <p className="text-sm text-muted">Time left</p>
          <p className={`mt-1 text-3xl font-semibold tabular-nums ${lowTime ? "text-danger" : ""}`} aria-live={lowTime ? "polite" : "off"}>
            {formatClock(remaining)}
          </p>
        </Card>
        <Card>
          <p className="mb-3 text-sm text-muted">
            {answeredCount} of {questions.length} answered
          </p>
          <div className="grid grid-cols-5 gap-2">
            {questions.map((qq, i) => (
              <button
                key={qq.id}
                onClick={() => setIndex(i)}
                aria-label={`Go to question ${i + 1}${selected[qq.id] != null ? " (answered)" : ""}`}
                aria-current={i === index ? "step" : undefined}
                className={`aspect-square rounded-md border text-sm tabular-nums ${
                  i === index ? "border-accent font-semibold" : "border-border"
                } ${selected[qq.id] != null ? "bg-accent/15" : ""}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <Button
            className="mt-4 w-full"
            disabled={submitting}
            onClick={() => {
              const unanswered = questions.length - answeredCount;
              if (unanswered === 0 || confirm(`${unanswered} question(s) unanswered. Submit anyway?`)) submit();
            }}
          >
            {submitting ? "Submitting…" : "Submit"}
          </Button>
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
    const tick = () => setRemaining(endsAtMs - (Date.now() + skew));
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [endsAtMs, skew]);
  return Math.max(remaining, 0);
}

function formatClock(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Opt-in replacement for the original app's forced fullscreen + alert() popups.
 * Distraction-reduction should be the student's choice; forcing it just blocks the UI.
 */
function FocusToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  return (
    <Button
      variant="secondary"
      className="w-full"
      onClick={() => (on ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
    >
      {on ? "Exit focus mode" : "Focus mode (fullscreen)"}
    </Button>
  );
}
