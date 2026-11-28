/**
 * Unit tests for "download all submissions" (ZIP writer, safe names) and multi-file
 * upload limits (Phase 3, 4.5). Run: npm run test:unit
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkUploads, MAX_REQUEST_UPLOAD_BYTES } from "../../src/lib/uploads";
import { crc32, safeZipSegment, uniqueName, zipBytes } from "../../src/lib/zip";

/** Reads a stored ZIP back through its central directory (what an unzip tool does). */
function readZip(zip: Uint8Array) {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = zip.length - 22;
  assert.equal(v.getUint32(eocd, true), 0x06054b50, "end of central directory");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out: { name: string; data: Uint8Array; crc: number }[] = [];
  for (let i = 0; i < count; i++) {
    assert.equal(v.getUint32(p, true), 0x02014b50, "central directory entry");
    const crc = v.getUint32(p + 16, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen));
    assert.equal(v.getUint32(local, true), 0x04034b50, "local header");
    const localNameLen = v.getUint16(local + 26, true);
    const start = local + 30 + localNameLen;
    out.push({ name, data: zip.subarray(start, start + size), crc });
    p += 46 + nameLen;
  }
  return out;
}

describe("zip writer", () => {
  it("computes the standard CRC-32", () => {
    assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
    assert.equal(crc32(new Uint8Array()), 0);
  });
  it("writes entries that read back byte for byte, with UTF-8 names and folders", async () => {
    const a = new TextEncoder().encode("hello");
    const b = new Uint8Array([0, 1, 2, 255]);
    const zip = await zipBytes([
      { path: "24CS1001/online-text.txt", data: () => a },
      { path: "24CS1001/रिपोर्ट.pdf", data: async () => b },
      { path: "empty.txt", data: () => new Uint8Array() },
    ]);
    const entries = readZip(zip);
    assert.deepEqual(entries.map((e) => e.name), ["24CS1001/online-text.txt", "24CS1001/रिपोर्ट.pdf", "empty.txt"]);
    assert.deepEqual([...entries[0].data], [...a]);
    assert.deepEqual([...entries[1].data], [...b]);
    assert.equal(entries[1].crc, crc32(b));
    assert.equal(entries[2].data.length, 0);
  });
  it("an empty archive is still a valid ZIP", async () => {
    assert.equal(readZip(await zipBytes([])).length, 0);
  });
});

describe("safe names inside the archive", () => {
  it("can't escape the folder or hide a path", () => {
    for (const evil of ["../../etc/passwd", "..\\..\\boot.ini", "/abs/path.pdf", "a/b\\c.txt", "..", ".", "   ", ""]) {
      const s = safeZipSegment(evil);
      assert.ok(!s.includes("/") && !s.includes("\\"), `${evil} -> ${s}`);
      assert.ok(s !== "." && s !== ".." && !s.startsWith("."), `${evil} -> ${s}`);
      assert.ok(s.length > 0);
    }
  });
  it("keeps ordinary names and avoids Windows device names", () => {
    assert.equal(safeZipSegment("report v2 (final).pdf"), "report v2 (final).pdf");
    assert.equal(safeZipSegment("24CS1001"), "24CS1001");
    assert.equal(safeZipSegment("CON.txt"), "_CON.txt");
    assert.equal(safeZipSegment("", "student-1"), "student-1");
  });
  it("numbers duplicates instead of overwriting", () => {
    const used = new Set<string>();
    assert.equal(uniqueName(used, "a.pdf"), "a.pdf");
    assert.equal(uniqueName(used, "A.pdf"), "A (2).pdf");
    assert.equal(uniqueName(used, "a.pdf"), "a (3).pdf");
    assert.equal(uniqueName(used, "notes"), "notes");
  });
});

describe("multi-file upload limits", () => {
  const txt = (name: string, size: number) => new File([new Uint8Array(size).fill(65)], name, { type: "text/plain" });
  it("accepts up to the maximum number of valid files and ignores empty inputs", async () => {
    const r = await checkUploads([txt("a.txt", 10), txt("b.txt", 10), new File([], "")], 2);
    assert.ok(Array.isArray(r) && r.length === 2);
  });
  it("refuses more files than allowed", async () => {
    const r = await checkUploads([txt("a.txt", 10), txt("b.txt", 10)], 1);
    assert.ok(!Array.isArray(r) && /at most 1 file\./.test(r.error));
  });
  it("refuses files that together exceed the request budget", async () => {
    const half = Math.ceil(MAX_REQUEST_UPLOAD_BYTES / 2) + 1;
    const r = await checkUploads([txt("a.txt", half), txt("b.txt", half)], 5);
    assert.ok(!Array.isArray(r) && /in total/.test(r.error));
  });
  it("names the file that fails validation", async () => {
    const r = await checkUploads([txt("a.txt", 10), new File([new Uint8Array([1, 2, 3])], "fake.pdf")], 5);
    assert.ok(!Array.isArray(r) && r.error.startsWith("fake.pdf:"));
  });
});
