/**
 * Upload validation. The browser-reported MIME type is just a claim, so we also
 * check the file's first bytes ("magic numbers") against what the type should be.
 * This stops e.g. an HTML file renamed to .pdf from being served as a document.
 */
import "server-only";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // keep in sync with serverActions.bodySizeLimit

type Rule = { ext: string[]; magic?: number[][]; zip?: boolean; text?: boolean };

const ZIP = [[0x50, 0x4b, 0x03, 0x04]];
export const ALLOWED: Record<string, Rule> = {
  "application/pdf": { ext: ["pdf"], magic: [[0x25, 0x50, 0x44, 0x46]] },
  "image/png": { ext: ["png"], magic: [[0x89, 0x50, 0x4e, 0x47]] },
  "image/jpeg": { ext: ["jpg", "jpeg"], magic: [[0xff, 0xd8, 0xff]] },
  "image/gif": { ext: ["gif"], magic: [[0x47, 0x49, 0x46, 0x38]] },
  "image/webp": { ext: ["webp"], magic: [[0x52, 0x49, 0x46, 0x46]] },
  // Office formats are ZIP containers.
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: ["docx"], magic: ZIP },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: ["pptx"], magic: ZIP },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: ["xlsx"], magic: ZIP },
  "text/plain": { ext: ["txt"], text: true },
  "text/csv": { ext: ["csv"], text: true },
};

export const ACCEPT_ATTR = Object.values(ALLOWED).flatMap((r) => r.ext.map((e) => `.${e}`)).join(",");

/** Images may be shown inline; everything else downloads. */
export const isInlineSafe = (mime: string) => mime.startsWith("image/") || mime === "application/pdf";

export type CheckedFile = { name: string; mimeType: string; data: Buffer };

export async function checkUpload(file: File): Promise<CheckedFile | { error: string }> {
  if (file.size === 0) return { error: "The file is empty." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "Files must be 8 MB or smaller." };

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const entry = Object.entries(ALLOWED).find(([, r]) => r.ext.includes(ext));
  if (!entry) return { error: "Allowed types: PDF, images, Word, PowerPoint, Excel, TXT, CSV." };
  const [mimeType, rule] = entry;

  const data = Buffer.from(await file.arrayBuffer());
  if (rule.magic && !rule.magic.some((sig) => sig.every((b, i) => data[i] === b))) {
    return { error: "The file's contents don't match its extension." };
  }
  if (rule.text && data.subarray(0, 4096).includes(0)) {
    return { error: "That doesn't look like a text file." };
  }

  // Keep only safe characters in the stored name (it ends up in a download header).
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || `file.${ext}`;
  return { name: safeName, mimeType, data };
}
