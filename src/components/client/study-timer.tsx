"use client";

import { Coffee, Pause, Play, RotateCcw, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Pomodoro-style study timer (25 min focus / 5 min break): the original app's
 * "focus" idea, made opt-in. Runs entirely in the browser; today's completed focus
 * sessions are remembered on this device only.
 */
const MODES = { focus: 25 * 60, break: 5 * 60 } as const;
type Mode = keyof typeof MODES;

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain).connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {}
}

const todayKey = () => `focus-sessions-${new Date().toISOString().slice(0, 10)}`;

export function StudyTimer() {
  const [mode, setMode] = useState<Mode>("focus");
  const [left, setLeft] = useState<number>(MODES.focus);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const endsAt = useRef<number | null>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage after mount
      setDone(Number(localStorage.getItem(todayKey()) ?? 0));
    } catch {}
  }, []);

  useEffect(() => {
    if (!running) return;
    endsAt.current = Date.now() + left * 1000;
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.round((endsAt.current! - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        clearInterval(id);
        setRunning(false);
        beep();
        if (mode === "focus") {
          const n = done + 1;
          setDone(n);
          try { localStorage.setItem(todayKey(), String(n)); } catch {}
          toast.success("Focus session complete! Take a 5-minute break: stretch, drink water, look away from the screen.");
          setMode("break");
          setLeft(MODES.break);
        } else {
          toast("Break over. Ready for another focus session?");
          setMode("focus");
          setLeft(MODES.focus);
        }
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  useEffect(() => {
    document.title = running ? `${fmt(left)} · ${mode === "focus" ? "Focus" : "Break"}` : "Dashboard · eduWave";
  }, [left, running, mode]);

  const total = MODES[mode];
  const progress = 1 - left / total;
  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative size-36">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
          <circle
            cx="60" cy="60" r={R} fill="none" strokeWidth="8" strokeLinecap="round"
            stroke={mode === "focus" ? "var(--accent)" : "var(--success)"}
            strokeDasharray={C} strokeDashoffset={C * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-300"
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-3xl font-semibold tabular-nums" role="timer" aria-live="off">{fmt(left)}</p>
            <p className="flex items-center justify-center gap-1 text-xs text-muted">
              {mode === "focus" ? <><Timer className="size-3" /> Focus</> : <><Coffee className="size-3" /> Break</>}
            </p>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setRunning((r) => !r)}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
        >
          {running ? <><Pause className="size-4" /> Pause</> : <><Play className="size-4" /> Start</>}
        </button>
        <button
          onClick={() => { setRunning(false); setMode("focus"); setLeft(MODES.focus); }}
          className="grid size-9 place-items-center rounded-lg border border-border hover:bg-surface-2"
          aria-label="Reset timer"
        >
          <RotateCcw className="size-4" />
        </button>
      </div>
      <p className="text-xs text-muted">
        {done} focus session{done === 1 ? "" : "s"} completed today
      </p>
    </div>
  );
}

function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
