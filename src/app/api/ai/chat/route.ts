import { z } from "zod";
import { aiEnabled, tutorStream } from "@/lib/ai";
import { getActiveUser } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/auth/throttle";

const body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(20), // only recent context is sent; also caps how much one request can cost the server
});

/** Streams the AI tutor's reply as plain text. */
export async function POST(request: Request) {
  const user = await getActiveUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!aiEnabled()) return new Response("AI is not configured", { status: 503 });

  // Route handlers don't get the Server Action body limit, so cap the request ourselves
  // (20 messages x 4,000 characters fits comfortably in 128 KB).
  const MAX_BODY = 128 * 1024;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return new Response("Request too large", { status: 413 });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return new Response("Request too large", { status: 413 });
  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    /* invalid JSON → 400 below */
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return new Response("Invalid request", { status: 400 });
  if (!(await rateLimit(`ai-chat:${user.id}`, 40, 60 * 60_000))) {
    return new Response("You've reached the hourly limit (40 messages). Take a break and try later.", { status: 429 });
  }

  try {
    const stream = await tutorStream(parsed.data.messages);
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("AI tutor failed", err instanceof Error ? err.message : err);
    return new Response("The AI tutor is unavailable right now. Is Ollama running?", { status: 502 });
  }
}
