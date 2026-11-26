"use client";

import { Bot, Send, Square, Trash2, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Explain photosynthesis like I'm 12",
  "Give me a hint for solving 2x + 5 = 17",
  "What's the difference between speed and velocity?",
  "Quiz me on the parts of a cell",
];

export function TutorChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string>();
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // Braces matter: scrollIntoView returns a Promise in newer browsers, and an effect
  // must return nothing or a cleanup function (returning a Promise crashes React).
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || streaming) return;
    setError(undefined);
    setInput("");
    const history: Msg[] = [...messages, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setStreaming(true);
    abort.current = new AbortController();

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-20) }),
        signal: abort.current.signal,
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: reply }]);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message || "Something went wrong.");
        setMessages(history);
      }
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-96 flex-col rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="grid h-full place-items-center text-center">
            <div className="max-w-md space-y-4">
              <Bot className="mx-auto size-10 text-accent" />
              <p className="text-sm text-muted">Ask about anything you&apos;re studying. I&apos;ll explain step by step and give hints rather than just answers.</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border border-border px-3 py-1.5 text-xs hover:border-accent hover:text-accent">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 animate-fade-in ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <span className={`grid size-8 shrink-0 place-items-center rounded-full ${m.role === "user" ? "bg-accent text-accent-foreground" : "bg-surface-2 text-accent"}`}>
              {m.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}
            </span>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-accent text-accent-foreground" : "bg-surface-2"}`}>
              {m.content ? <Markdown text={m.content} /> : <TypingDots />}
            </div>
          </div>
        ))}
        {error && <p className="text-center text-sm text-danger">{error}</p>}
        <div ref={bottom} />
      </div>
      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        {messages.length > 0 && (
          <button type="button" onClick={() => setMessages([])} disabled={streaming} className="grid size-10 place-items-center rounded-lg text-muted hover:bg-surface-2" aria-label="Clear conversation">
            <Trash2 className="size-4" />
          </button>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder="Ask a question… (Enter to send, Shift+Enter for a new line)"
          aria-label="Message"
          className="max-h-40 min-h-10 flex-1 resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
        />
        {streaming ? (
          <Button type="button" variant="secondary" onClick={() => abort.current?.abort()} aria-label="Stop"><Square className="size-4" /></Button>
        ) : (
          <Button type="submit" disabled={!input.trim()} aria-label="Send"><Send className="size-4" /></Button>
        )}
      </form>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="flex gap-1 py-1" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}
