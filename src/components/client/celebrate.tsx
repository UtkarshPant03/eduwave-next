"use client";

import confetti from "canvas-confetti";
import { useEffect } from "react";

/** Confetti once per attempt (not on every reload), skipped for reduced-motion users. */
export function Celebrate({ id }: { id: string }) {
  useEffect(() => {
    const key = `celebrated-${id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 }, disableForReducedMotion: true });
  }, [id]);
  return null;
}
