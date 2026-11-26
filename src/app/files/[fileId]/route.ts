import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { getFileForUser } from "@/lib/data";
import { isInlineSafe } from "@/lib/uploads";

/** Serves an uploaded file to members of its class only. */
export async function GET(_: Request, ctx: RouteContext<"/files/[fileId]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { fileId } = await ctx.params;
  const id = z.uuid().safeParse(fileId);
  const file = id.success ? await getFileForUser(user, id.data) : null;
  // Same 404 for "doesn't exist" and "not yours", so ids can't be probed.
  if (!file) return new Response("Not found", { status: 404 });

  const inline = isInlineSafe(file.mimeType);
  const headers = new Headers({
    "Content-Type": file.mimeType,
    "Content-Length": String(file.size),
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    // Never let the browser guess a different (e.g. HTML) type.
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=3600",
  });
  // Images can't run scripts, but lock them down anyway.
  if (file.mimeType.startsWith("image/")) headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");

  return new Response(new Uint8Array(file.data), { headers });
}
