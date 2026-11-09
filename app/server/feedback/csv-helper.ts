function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  const text = String(value);
  // A leading =, +, - or @ makes spreadsheets run the cell as a formula.
  const safe =
    /^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text;

  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: readonly Record<string, unknown>[]): string {
  if (rows.length === 0) return "";

  const columns = Object.keys(rows[0]);
  const lines = [
    columns.map(csvCell).join(","),
    ...rows.map((row) =>
      columns.map((column) => csvCell(row[column])).join(","),
    ),
  ];

  // The byte-order mark makes Excel read the file as UTF-8.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function csvResponse(
  fileName: string,
  rows: readonly Record<string, unknown>[],
) {
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
