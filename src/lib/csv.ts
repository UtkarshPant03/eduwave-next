/**
 * CSV formula injection: a cell like `=HYPERLINK(...)` executes when the CSV is opened
 * in Excel/Sheets. Prefixing such cells with an apostrophe makes them plain text.
 */
function cell(value: unknown) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvResponse(name: string, rows: unknown[][]) {
  const csv = "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n"); // BOM so Excel reads UTF-8
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name.replace(/[^\w-]+/g, "_")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
