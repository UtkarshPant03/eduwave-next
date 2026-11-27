/**
 * Upload validation. The browser-reported MIME type is just a claim, so we also
 * check the file's first bytes ("magic numbers") against what the type should be.
 * This stops e.g. an HTML file renamed to .pdf from being served as a document.
 */
import "server-only";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // keep in sync with serverActions.bodySizeLimit

type Rule = {
  ext: string[];
  magic?: number[][];
  text?: boolean;
  /** Extra structural check beyond the first bytes (see OOXML and WebP below). */
  verify?: (data: Buffer) => boolean;
};

/**
 * Office files are ZIP archives, but so is any ZIP (which could hold an .exe or a script).
 * A real Office Open XML document always contains "[Content_Types].xml" and its main
 * folder (word/, ppt/ or xl/). Entry names are stored uncompressed in the ZIP directory,
 * so a byte search finds them without unzipping anything (no zip-bomb risk).
 */
const ooxml = (folder: string) => (data: Buffer) =>
  data.includes(Buffer.from("[Content_Types].xml")) && data.includes(Buffer.from(folder));

const ZIP = [[0x50, 0x4b, 0x03, 0x04]];
export const ALLOWED: Record<string, Rule> = {
  "application/pdf": { ext: ["pdf"], magic: [[0x25, 0x50, 0x44, 0x46]] },
  "image/png": { ext: ["png"], magic: [[0x89, 0x50, 0x4e, 0x47]] },
  "image/jpeg": { ext: ["jpg", "jpeg"], magic: [[0xff, 0xd8, 0xff]] },
  "image/gif": { ext: ["gif"], magic: [[0x47, 0x49, 0x46, 0x38]] },
  // RIFF is shared with WAV/AVI; a WebP image has "WEBP" at bytes 8-11.
  "image/webp": { ext: ["webp"], magic: [[0x52, 0x49, 0x46, 0x46]], verify: (d) => d.subarray(8, 12).toString("latin1") === "WEBP" },
  // Office formats are ZIP containers with a fixed structure.
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: ["docx"], magic: ZIP, verify: ooxml("word/") },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: ["pptx"], magic: ZIP, verify: ooxml("ppt/") },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: ["xlsx"], magic: ZIP, verify: ooxml("xl/") },
  "text/plain": { ext: ["txt"], text: true },
  "text/csv": { ext: ["csv"], text: true },
};

export const ACCEPT_ATTR = Object.values(ALLOWED).flatMap((r) => r.ext.map((e) => `.${e}`)).join(",");

/**
 * What may open in the browser instead of downloading. Images always (served with a
 * sandbox CSP). PDFs only when staff uploaded them (course materials): a student's PDF
 * opened inline would run in the LMS's own origin in the instructor's browser, which is
 * the most valuable session to attack, so student uploads always download.
 */
export const isInlineSafe = (mime: string, uploaderRole: string) =>
  mime.startsWith("image/") || (mime === "application/pdf" && uploaderRole !== "student");

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
  if (rule.verify && !rule.verify(data)) {
    return { error: "The file's contents don't match its extension." };
  }
  if (rule.text && data.subarray(0, 4096).includes(0)) {
    return { error: "That doesn't look like a text file." };
  }

  // Keep only safe characters in the stored name (it ends up in a download header).
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || `file.${ext}`;
  return { name: safeName, mimeType, data };
}
