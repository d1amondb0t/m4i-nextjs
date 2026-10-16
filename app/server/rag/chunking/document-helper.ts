import { spawn } from "node:child_process";
import { PDFParse } from "pdf-parse";
import { getData as getPdfWorkerData } from "pdf-parse/worker";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import type {
  DocumentBlockType,
  ExtractedBlock,
  ExtractedPage,
} from "@/types/chunk-type";

PDFParse.setWorker(getPdfWorkerData());

export function cleanText(text: string): string {
  return text
    .replace(/\x00/g, " ")
    .replace(/<latexit\b[\s\S]*?<\/latexit>/gi, " ")
    .replace(/(?<=\w)-\r?\n(?=\w)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeUtf8(data: Uint8Array, filename: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch (error) {
    throw new Error(`${filename} is not valid UTF-8 text.`, { cause: error });
  }
}

export function pageQualityReason(text: string): string | undefined {
  const cleaned = cleanText(text);
  if (!cleaned) return "no extractable text";
  if (/^(?:#(?:NAME|REF|VALUE|DIV\/0|N\/A)[!?]?\s*)+$/i.test(cleaned)) {
    return "spreadsheet error in place of page text";
  }
  if (
    (cleaned.match(/\uFFFD/g) ?? []).length > Math.max(2, cleaned.length * 0.01)
  ) {
    return "too many replacement characters";
  }
  const tokens = cleaned.split(/\s+/);
  const joined = tokens.filter((token) => /\p{L}{36,}/u.test(token)).length;
  if (
    (tokens.length <= 3 && joined > 0) ||
    joined >= Math.max(3, tokens.length * 0.1)
  ) {
    return "probable joined words";
  }
  if (cleaned.length >= 100 && tokens.length < 8) {
    return "too few word boundaries";
  }
  return undefined;
}

export type OcrPage = (parser: PDFParse, pageNumber: number) => Promise<string>;

/** A positioned pdf.js text item in viewport coordinates (y grows downwards). */
export type LayoutItem = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Text with surrounding whitespace removed. */
  text: string;
  /** Text as pdf.js returned it, so encoded spaces can be honoured. */
  raw: string;
};

function groupRows(items: readonly LayoutItem[]): LayoutItem[][] {
  const rows: LayoutItem[][] = [];
  for (const item of [...items].sort(
    (left, right) => left.y - right.y || left.x - right.x,
  )) {
    const row = rows.find(
      (candidate) => Math.abs(candidate[0].y - item.y) <= 3,
    );
    if (row) row.push(item);
    else rows.push([item]);
  }
  return rows.map((row) => row.sort((left, right) => left.x - right.x));
}

/** Join items on one line: nothing inside a word, a space between words, a tab across a wide gap. */
function joinRow(row: readonly LayoutItem[]): string {
  let line = "";
  let previous: LayoutItem | undefined;
  for (const item of row) {
    if (previous) {
      // Fake-bold copies of the same text drawn at almost the same position.
      if (item.text === previous.text && Math.abs(item.x - previous.x) <= 2)
        continue;
      const gap = item.x - (previous.x + previous.width);
      const size = Math.max(previous.height, item.height, 1);
      const charWidth = Math.max(
        Math.min(
          previous.width / previous.text.length,
          item.width / item.text.length,
        ),
        0.5,
      );
      // Within-word gaps are kerning-sized; word spaces are about half a
      // character. Clearly overlapping items (stacked glyphs) stay separate,
      // and so do words that would join into an implausibly long word (OCR
      // layers often place separate words edge to edge).
      const wordGap = Math.min(size * 0.1, charWidth * 0.2);
      const joinedLetters =
        (line.match(/\p{L}+$/u)?.[0].length ?? 0) +
        (item.text.match(/^\p{L}+/u)?.[0].length ?? 0);
      line +=
        gap > Math.max(12, previous.height * 1.5)
          ? "\t"
          : /\s$/.test(previous.raw) ||
              /^\s/.test(item.raw) ||
              gap > wordGap ||
              gap < -charWidth * 0.5 ||
              joinedLetters > 24
            ? " "
            : "";
    }
    line += item.text;
    previous = item;
  }
  return line;
}

function crossesAt(row: readonly LayoutItem[], x: number): boolean {
  return row.some((item) => item.x < x - 1 && item.x + item.width > x + 1);
}

/** Consecutive rows that do not cross x form one band; each crossing row stands alone. */
function bandsAt(
  rows: readonly LayoutItem[][],
  x: number,
): { rows: LayoutItem[][]; crossing: boolean }[] {
  const bands: { rows: LayoutItem[][]; crossing: boolean }[] = [];
  for (const row of rows) {
    const crossing = crossesAt(row, x);
    const last = bands.at(-1);
    if (!crossing && last && !last.crossing) last.rows.push(row);
    else bands.push({ rows: [row], crossing });
  }
  return bands;
}

/** The band's left and right column lines, when both sides hold sentence-length text. */
function columnSides(
  band: readonly LayoutItem[][],
  x: number,
): { left: LayoutItem[][]; right: LayoutItem[][] } | undefined {
  const side = (left: boolean) =>
    band
      .map((row) => row.filter((item) => item.x + item.width / 2 < x === left))
      .filter((row) => row.length > 0);
  const prose = (lines: LayoutItem[][]) =>
    lines.length >= 4 &&
    lines.reduce(
      (sum, line) =>
        sum +
        line
          .map((item) => item.text)
          .join(" ")
          .split(/\s+/).length,
      0,
    ) /
      lines.length >=
      5;
  const left = side(true);
  const right = side(false);
  return prose(left) && prose(right) ? { left, right } : undefined;
}

/**
 * The x-position of a two-column gutter: the middle-of-page position whose
 * best uncrossed band has the most column lines on both sides. Full-width rows
 * elsewhere on the page (titles, boxes, single-column sections) do not prevent
 * detection, and tables with short cells are not treated as columns.
 */
function columnGutter(
  rows: readonly LayoutItem[][],
  width: number,
): number | undefined {
  if (rows.length < 8) return undefined;
  const score = (x: number) =>
    Math.max(
      0,
      ...bandsAt(rows, x)
        .filter((band) => !band.crossing)
        .map((band) => {
          const sides = columnSides(band.rows, x);
          return sides ? Math.min(sides.left.length, sides.right.length) : 0;
        }),
    );
  let bestScore = 0;
  let positions: number[] = [];
  for (let x = width * 0.3; x <= width * 0.7; x += 2) {
    const value = score(x);
    if (value > bestScore) {
      bestScore = value;
      positions = [x];
    } else if (value === bestScore && value > 0 && x - positions.at(-1)! <= 2) {
      positions.push(x);
    }
  }
  return bestScore > 0 ? (positions[0] + positions.at(-1)!) / 2 : undefined;
}

/** Render one page's items as lines in reading order, with blank lines at paragraph gaps. */
export function layoutText(
  items: readonly LayoutItem[],
  width: number,
): string {
  let rows = groupRows(items);
  const gutter = columnGutter(rows, width);
  if (gutter !== undefined) {
    // Read each two-column band left column first; other rows keep their order.
    rows = bandsAt(rows, gutter).flatMap((band) => {
      const sides = band.crossing ? undefined : columnSides(band.rows, gutter);
      return sides ? [...sides.left, ...sides.right] : band.rows;
    });
  }
  return rows
    .map((row, index) => {
      const previous = rows[index - 1];
      const gap = previous ? row[0].y - previous[0].y : 0;
      return (
        (previous && gap > Math.max(20, previous[0].height * 1.8) ? "\n" : "") +
        joinRow(row)
      );
    })
    .join("\n");
}

async function layoutPdfPages(
  bytes: Uint8Array,
): Promise<Array<{ num: number; text: string; blank: boolean }>> {
  const task = getDocument({ data: new Uint8Array(bytes) });
  try {
    const document = await task.promise;
    const pages: Array<{ num: number; text: string; blank: boolean }> = [];
    for (let num = 1; num <= document.numPages; num += 1) {
      const page = await document.getPage(num);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items
        .filter(
          (
            item,
          ): item is typeof item & {
            str: string;
            transform: number[];
            width: number;
            height: number;
          } => "str" in item && "transform" in item && Boolean(item.str.trim()),
        )
        .map((item): LayoutItem => {
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
            raw: item.str,
          };
        });
      const text = layoutText(items, viewport.width);
      let blank = false;
      if (!text.trim()) {
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
        blank = !painted && operations.fnArray.length < 20;
      }
      pages.push({ num, text, blank });
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/** OCR is optional at runtime; failed pages stay quarantined if Tesseract is unavailable. */
export async function ocrPdfPage(
  parser: PDFParse,
  pageNumber: number,
): Promise<string> {
  const screenshot = await parser.getScreenshot({
    partial: [pageNumber],
    desiredWidth: 2000,
    imageBuffer: true,
    imageDataUrl: false,
  });
  const image = screenshot.pages[0]?.data;
  if (!image) return "";
  return new Promise<string>((resolve) => {
    const child = spawn(
      /*turbopackIgnore: true*/
      process.env.TESSERACT_PATH || "tesseract",
      ["stdin", "stdout", "-l", "eng"],
      {
        stdio: ["pipe", "pipe", "ignore"],
      },
    );
    const output: Uint8Array[] = [];
    const timeout = setTimeout(() => child.kill(), 30_000);
    child.stdout.on("data", (part: Uint8Array) => output.push(part));
    child.on("error", () => {
      clearTimeout(timeout);
      resolve("");
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve(code === 0 ? Buffer.concat(output).toString("utf8") : "");
    });
    child.stdin.on("error", () => {});
    child.stdin.end(image);
  });
}

const REFERENCE_HEADING =
  /^(?:\d+(?:\.\d+)*\.?\s*)?(?:references|bibliography|works cited|literature cited|bibliograf[ií]a|r[ée]f[ée]rences(?: bibliographiques)?|литература|література|список літератури|список литературы|список використаних джерел)(?=$|[\s(:])/iu;

function isHeading(line: string): boolean {
  const words = line.match(/\p{L}{2,}/gu) ?? [];
  const letters = (line.match(/\p{L}/gu) ?? []).length;
  // OCR debris, IDs, letter-spaced running headers and joined words are not headings.
  if (
    !words.some((word) => word.length >= 3) ||
    letters / line.length < 0.6 ||
    /(?:^|\s)(?:\p{L}\s){3,}\p{L}(?:\s|$)/u.test(line) ||
    /\p{L}{20,}/u.test(line) ||
    line.includes("_")
  ) {
    return false;
  }
  if (REFERENCE_HEADING.test(line)) return true;
  if (/^\d+(?:\.\d+)*\.?\s+/.test(line)) {
    // Numbered headings are short; a numbered paragraph's first line is not.
    return (
      /^(?:\d+(?:\.\d+)*\.?\s+)\p{Lu}[^.!?]{2,100}$/u.test(line) &&
      words.length <= 10 &&
      !/[,;]$/.test(line)
    );
  }
  return (
    /^(?:abstract|introduction|conclusions?|methods?|results?|discussion)$/i.test(
      line,
    ) ||
    (line.length >= 4 &&
      line.length <= 100 &&
      /\p{Lu}/u.test(line) &&
      line === line.toUpperCase() &&
      !/[.!?]$/.test(line))
  );
}

function isCaption(line: string): boolean {
  return /^(?:fig(?:ure)?|table)\s*\d+(?:[.:\s-]|$)/i.test(line);
}

function rowCells(line: string): string[] {
  return line
    .split(/\t+| {3,}/)
    .map(cleanText)
    .filter(Boolean);
}

/** Running headers and footers repeat with changing page numbers, so digits are ignored. */
function edgeKey(line: string): string {
  return cleanText(line)
    .toLowerCase()
    .replace(/\d[\d\s]*/g, "#")
    .replace(/\s+/g, "");
}

function repeatedEdges(
  pages: readonly string[][],
  edge: "first" | "last",
): Set<string> {
  const counts = new Map<string, number>();
  for (const lines of pages) {
    const line = edge === "first" ? lines[0] : lines.at(-1);
    if (line && line.length <= 120) {
      const key = edgeKey(line);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return new Set(
    [...counts].filter(([, count]) => count >= 2).map(([key]) => key),
  );
}

/** Preserve layout boundaries before text is flattened for embeddings. */
export function structurePdfPages(
  pages: readonly ExtractedPage[],
): ExtractedPage[] {
  const linesByPage = pages.map((page) =>
    page.text
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim()),
  );
  const headers = repeatedEdges(linesByPage, "first");
  const footers = repeatedEdges(linesByPage, "last");
  let section: string | undefined;
  let references = false;

  return pages.map((page, pageIndex) => {
    if (page.quality === "quarantined")
      return { ...page, text: "", blocks: [] };
    const lines = linesByPage[pageIndex];
    const blocks: ExtractedBlock[] = [];
    let paragraph: string[] = [];
    let table: string[][] = [];
    const add = (type: DocumentBlockType, text: string) => {
      if (text)
        blocks.push({
          page: page.page,
          type,
          text,
          ...(section ? { section } : {}),
        });
    };
    const flushParagraph = () => {
      if (paragraph.length)
        add(
          references ? "reference" : "paragraph",
          // Rejoin words hyphenated across lines ("popu-" + "lation").
          cleanText(
            paragraph.reduce((text, line) =>
              /\p{Ll}\s?-$/u.test(text) && /^\p{Ll}/u.test(line)
                ? text.replace(/\s?-$/, "") + line
                : text + " " + line,
            ),
          ),
        );
      paragraph = [];
    };
    const flushTable = () => {
      if (table.length)
        add("table", table.map((cells) => cells.join(" | ")).join("\n"));
      table = [];
    };

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line) {
        flushParagraph();
        flushTable();
        continue;
      }
      const normalized = edgeKey(line);
      const edgeType =
        index === 0 && headers.has(normalized)
          ? "header"
          : index === lines.length - 1 &&
              (footers.has(normalized) || /^\d+$/.test(line))
            ? "footer"
            : undefined;
      const cells = rowCells(line);
      const tableRow =
        cells.length >= 3 || (cells.length >= 2 && line.includes("\t"));

      if (edgeType || isCaption(line) || isHeading(line) || tableRow) {
        flushParagraph();
        if (!tableRow) flushTable();
        if (edgeType) add(edgeType, cleanText(line));
        else if (isCaption(line)) add("caption", cleanText(line));
        else if (isHeading(line)) {
          section = cleanText(line);
          references = REFERENCE_HEADING.test(section);
          add("heading", section);
        } else table.push(cells);
      } else {
        flushTable();
        if (paragraph.length && /[.!?]$/.test(paragraph.at(-1)!))
          flushParagraph();
        paragraph.push(line);
      }
    }
    flushParagraph();
    flushTable();
    return {
      ...page,
      text: blocks.map((block) => block.text).join("\n"),
      blocks,
    };
  });
}

export async function extractFile(
  file: File,
  extension: string,
  ocr: OcrPage = ocrPdfPage,
): Promise<ExtractedPage[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (extension !== "pdf") {
    return [
      {
        page: 1,
        text: cleanText(decodeUtf8(bytes, file.name)),
      },
    ];
  }

  const parser = new PDFParse({ data: bytes });
  try {
    const result = await layoutPdfPages(bytes);
    const pages: ExtractedPage[] = [];
    for (const page of result) {
      if (page.blank) {
        pages.push({ page: page.num, text: "", quality: "extracted" });
        continue;
      }
      let raw = page.text;
      let reason = pageQualityReason(raw);
      let qualityReason: string | undefined;
      let quality: ExtractedPage["quality"] = "extracted";
      if (reason) {
        const extractionReason = reason;
        try {
          raw = await ocr(parser, page.num);
        } catch {
          raw = "";
        }
        reason = pageQualityReason(raw);
        quality = reason ? "quarantined" : "ocr";
        if (reason)
          qualityReason = `Extraction: ${extractionReason}; OCR: ${reason}`;
      }
      pages.push({
        page: page.num,
        text: quality === "quarantined" ? "" : raw,
        quality,
        ...(qualityReason ? { qualityReason } : {}),
      });
    }
    return structurePdfPages(pages);
  } finally {
    await parser.destroy();
  }
}
