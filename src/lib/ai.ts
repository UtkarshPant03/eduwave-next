/**
 * Optional AI features powered by Ollama (https://ollama.com): free, open-source,
 * runs open models (Llama, Qwen, Gemma, ...) on your own machine. No API key, no bill,
 * and student questions never leave your server.
 *
 * Setup:  install Ollama, run `ollama pull llama3.2`, then set OLLAMA_URL=http://localhost:11434
 * If OLLAMA_URL is not set, AI features are hidden and the rest of the app works normally.
 *
 * Limitations to teach: small local models make mistakes. AI-generated questions are
 * drafts the instructor must review, and the tutor tells students to verify answers.
 */
import "server-only";
import { z } from "zod";

export const aiEnabled = () => Boolean(process.env.OLLAMA_URL);
const model = () => process.env.OLLAMA_MODEL ?? "llama3.2";

export type ChatMessage = { role: "user" | "assistant"; content: string };

const TUTOR_PROMPT = `You are eduWave's study tutor for school students.
- Explain concepts step by step in simple language, with a short example.
- For homework or quiz-style questions, guide with hints and questions first instead of giving the final answer outright.
- If you are not sure, say so. Never invent facts, sources or quotes.
- Keep answers under 250 words unless asked for more. Use Markdown lists where helpful.
- Politely decline requests unrelated to studying.`;

/** Streams the tutor's reply as plain text chunks. */
export async function tutorStream(history: ChatMessage[]): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${process.env.OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model(),
      stream: true,
      messages: [{ role: "system", content: TUTOR_PROMPT }, ...history],
      options: { temperature: 0.4 },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok || !res.body) throw new Error(`Ollama returned ${res.status}`);

  // Ollama streams NDJSON ({"message":{"content":"..."},"done":false}); forward only the text.
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const text = JSON.parse(line)?.message?.content;
            if (text) controller.enqueue(encoder.encode(text));
          } catch {
            /* ignore partial/malformed lines */
          }
        }
      },
    }),
  );
}

const generatedSchema = z.object({
  questions: z
    .array(
      z.object({
        prompt: z.string().min(1),
        options: z.array(z.string().min(1)).min(2).max(6),
        correctIndex: z.number().int().min(0),
        explanation: z.string().optional(),
      }),
    )
    .min(1),
});

export type GeneratedQuestion = z.infer<typeof generatedSchema>["questions"][number];

/** Drafts multiple-choice questions from instructor-provided material, using JSON-schema output. */
export async function generateQuestions(material: string, count: number, subject: string): Promise<GeneratedQuestion[]> {
  const res = await fetch(`${process.env.OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model(),
      stream: false,
      format: z.toJSONSchema(generatedSchema),
      options: { temperature: 0.3 },
      messages: [
        {
          role: "system",
          content:
            "You write accurate multiple-choice quiz questions for school students. Use ONLY facts stated in the provided material. Each question has 4 options, exactly one correct; correctIndex is the 0-based index of the correct option. Add a one-sentence explanation.",
        },
        { role: "user", content: `Subject: ${subject}\nWrite ${count} questions.\n\nMaterial:\n"""\n${material}\n"""` },
      ],
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const json = await res.json();
  const parsed = generatedSchema.parse(JSON.parse(json.message.content));
  // Models sometimes return out-of-range answers; drop those instead of trusting them.
  return parsed.questions.filter((q) => q.correctIndex < q.options.length).slice(0, count);
}
