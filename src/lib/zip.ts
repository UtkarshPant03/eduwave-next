/**
 * A minimal, dependency-free ZIP writer ("stored": no compression).
 *
 * Used for "download all submissions". Student files are mostly PDFs, images and Office
 * documents, which are already compressed, so storing them costs little and keeps this
 * small enough to audit. Entries are produced one at a time from a stream, so the server
 * holds at most one file in memory, not the whole archive.
 *
 * Limits (classic ZIP, no ZIP64): at most 65,535 entries and 4 GB in total; the stream
 * errors out beyond that rather than writing a corrupt archive.
 *
 * Pure module (no database access): unit-tested in tests/unit/submissions.test.ts.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS date and time (local fields, 2-second resolution, 1980 or later). */
function dosDateTime(d: Date) {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

/**
 * One safe path segment (a folder or file name inside the archive): no separators, no
 * "." or ".." (so nothing can escape the extraction folder), no control or shell-special
 * characters, no names Windows refuses. Never empty.
 */
export function safeZipSegment(name: string, fallback = "file") {
  let s = name
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}._\- ()]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 100)
    .trim();
  if (!s || /^[._]+$/.test(s)) s = fallback;
  if (WINDOWS_RESERVED.test(s)) s = `_${s}`;
  return s;
}

/** Adds " (2)", " (3)", ... before the extension when a name is already used (case-insensitive). */
export function uniqueName(used: Set<string>, name: string) {
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  let candidate = name;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

export type ZipEntry = {
  /** Path inside the archive, segments joined with "/". Build it from safeZipSegment(). */
  path: string;
  /** Loaded only when the entry is written. */
  data: () => Promise<Uint8Array> | Uint8Array;
  modified?: Date;
};

const MAX_32 = 0xffffffff;

/** Streams a stored (uncompressed) ZIP archive of the entries, in order. */
export function zipStream(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  if (entries.length > 0xffff) throw new Error("Too many files for one archive.");
  const central: Uint8Array[] = [];
  let offset = 0;
  let i = 0;
  const enc = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (i < entries.length) {
        const entry = entries[i++];
        const name = enc.encode(entry.path);
        const data = await entry.data();
        const crc = crc32(data);
        const { time, date } = dosDateTime(entry.modified ?? new Date());
        if (offset + 30 + name.length + data.length > MAX_32) {
          controller.error(new Error("The archive would be larger than 4 GB."));
          return;
        }

        const local = new Uint8Array(30 + name.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true); // local file header signature
        lv.setUint16(4, 20, true); // version needed (2.0)
        lv.setUint16(6, 0x0800, true); // flags: names are UTF-8
        lv.setUint16(8, 0, true); // method: stored
        lv.setUint16(10, time, true);
        lv.setUint16(12, date, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, data.length, true); // compressed size
        lv.setUint32(22, data.length, true); // uncompressed size
        lv.setUint16(26, name.length, true);
        lv.setUint16(28, 0, true); // extra field length
        local.set(name, 30);

        const dir = new Uint8Array(46 + name.length);
        const dv = new DataView(dir.buffer);
        dv.setUint32(0, 0x02014b50, true); // central directory signature
        dv.setUint16(4, 20, true); // version made by
        dv.setUint16(6, 20, true); // version needed
        dv.setUint16(8, 0x0800, true);
        dv.setUint16(10, 0, true);
        dv.setUint16(12, time, true);
        dv.setUint16(14, date, true);
        dv.setUint32(16, crc, true);
        dv.setUint32(20, data.length, true);
        dv.setUint32(24, data.length, true);
        dv.setUint16(28, name.length, true);
        // extra, comment, disk number, internal attributes, external attributes: 0
        dv.setUint32(42, offset, true); // offset of the local header
        dir.set(name, 46);
        central.push(dir);

        offset += local.length + data.length;
        controller.enqueue(local);
        if (data.length) controller.enqueue(data);
        return;
      }

      const size = central.reduce((s, c) => s + c.length, 0);
      if (offset + size + 22 > MAX_32) {
        controller.error(new Error("The archive would be larger than 4 GB."));
        return;
      }
      for (const c of central) controller.enqueue(c);
      const end = new Uint8Array(22);
      const ev = new DataView(end.buffer);
      ev.setUint32(0, 0x06054b50, true); // end of central directory signature
      ev.setUint16(8, entries.length, true); // entries on this disk
      ev.setUint16(10, entries.length, true); // entries in total
      ev.setUint32(12, size, true);
      ev.setUint32(16, offset, true);
      controller.enqueue(end);
      controller.close();
    },
  });
}

/** Whole archive in memory (tests and small archives). */
export async function zipBytes(entries: ZipEntry[]) {
  return new Uint8Array(await new Response(zipStream(entries)).arrayBuffer());
}
