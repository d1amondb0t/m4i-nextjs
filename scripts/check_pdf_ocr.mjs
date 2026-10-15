// A conservative preflight: reject a PDF if any nonblank page needs OCR.
// Keep this aligned with pageQualityReason in document-helper.ts.
import { readFile } from "node:fs/promises";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

function qualityReason(text) {
  const cleaned = text.replace(/\x00/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "no extractable text";
  if (/^(?:#(?:NAME|REF|VALUE|DIV\/0|N\/A)[!?]?\s*)+$/i.test(cleaned))
    return "spreadsheet error in place of page text";
  if (
    (cleaned.match(/\uFFFD/g) ?? []).length > Math.max(2, cleaned.length * 0.01)
  )
    return "too many replacement characters";
  const tokens = cleaned.split(/\s+/);
  // A lone long URL or unbroken identifier is common in otherwise readable PDFs.
  // Require pervasive word joining before treating it as an OCR case.
  const joined = tokens.filter((token) => /\p{L}{36,}/u.test(token)).length;
  if (
    (tokens.length <= 3 && joined > 0) ||
    joined >= Math.max(3, tokens.length * 0.1)
  )
    return "probable joined words";
  if (cleaned.length >= 100 && tokens.length < 8)
    return "too few word boundaries";
  return undefined;
}

async function check(path) {
  const task = getDocument({ data: new Uint8Array(await readFile(path)) });
  try {
    const pdf = await task.promise;
    if (pdf.numPages === 0) return { ok: false, reason: "no pages" };
    let words = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items
        .filter(
          (item) =>
            "str" in item && "transform" in item && Boolean(item.str.trim()),
        )
        .map((item) => {
          const [x, y] = viewport.convertToViewportPoint(
            item.transform[4],
            item.transform[5],
          );
          return {
            x,
            y,
            width: item.width,
            height: item.height,
            text: item.str.trim(),
          };
        });
      const rows = [];
      for (const item of items.sort((a, b) => a.y - b.y || a.x - b.x)) {
        const row = rows.find(
          (candidate) => Math.abs(candidate[0].y - item.y) <= 3,
        );
        if (row) row.push(item);
        else rows.push([item]);
      }
      const rendered = rows.map((row) => {
        const sorted = row.sort((a, b) => a.x - b.x);
        let line = "";
        let previous;
        for (const item of sorted) {
          if (previous) {
            const gap = item.x - (previous.x + previous.width);
            line += gap > Math.max(12, previous.height * 1.5) ? "\t" : " ";
          }
          line += item.text;
          previous = item;
        }
        return { text: line, y: sorted[0].y, height: sorted[0].height };
      });
      const text = rendered
        .map((row, index) => {
          const previous = rendered[index - 1];
          const gap = previous ? row.y - previous.y : 0;
          return (
            (previous && gap > Math.max(20, previous.height * 1.8)
              ? "\n"
              : "") + row.text
          );
        })
        .join("\n");
      const reason = qualityReason(text);
      if (reason) {
        if (reason === "no extractable text") {
          const operations = await page.getOperatorList();
          const painted = operations.fnArray.some((operation) =>
            [
              OPS.paintXObject,
              OPS.paintFormXObjectBegin,
              OPS.paintImageXObject,
              OPS.paintInlineImageXObject,
              OPS.paintImageMaskXObject,
              OPS.paintImageXObjectRepeat,
            ].includes(operation),
          );
          if (!painted && operations.fnArray.length < 20) {
            page.cleanup();
            continue; // blank page
          }
        }
        return { ok: false, page: number, reason };
      }
      words += text.trim().split(/\s+/).length;
      page.cleanup();
    }
    return words >= 50
      ? { ok: true, pages: pdf.numPages, words }
      : { ok: false, reason: "fewer than 50 extractable words" };
  } finally {
    await task.destroy();
  }
}

try {
  if (!process.argv[2])
    throw new Error("usage: node check_pdf_ocr.mjs FILE.pdf");
  console.log(JSON.stringify(await check(process.argv[2])));
} catch (error) {
  console.log(JSON.stringify({ ok: false, reason: String(error) }));
  process.exitCode = 1;
}
