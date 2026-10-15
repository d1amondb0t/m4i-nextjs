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
      const rows: (typeof items)[] = [];
      for (const item of items.sort(
        (left, right) => left.y - right.y || left.x - right.x,
      )) {
        const row = rows.find(
          (candidate) => Math.abs(candidate[0].y - item.y) <= 3,
        );
        if (row) row.push(item);
        else rows.push([item]);
      }
      const renderedRows = rows.map((row) => {
        const sorted = row.sort((left, right) => left.x - right.x);
        let line = "";
        let previous: (typeof sorted)[number] | undefined;
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
      const text = renderedRows
        .map((row, index) => {
          const previous = renderedRows[index - 1];
          const gap = previous ? row.y - previous.y : 0;
          return (
            (previous && gap > Math.max(20, previous.height * 1.8)
              ? "\n"
              : "") + row.text
          );
        })
        .join("\n");
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

function isHeading(line: string): boolean {
  return (
    /^(?:\d+(?:\.\d+)*\.?\s+)[A-Z][^.!?]{2,100}$/.test(line) ||
    /^(?:abstract|introduction|conclusion|references|bibliography|methods?|results?|discussion)$/i.test(
      line,
    ) ||
    (line.length >= 4 &&
      line.length <= 100 &&
      /[A-Z]/.test(line) &&
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

function repeatedEdges(
  pages: readonly string[][],
  edge: "first" | "last",
): Set<string> {
  const counts = new Map<string, number>();
  for (const lines of pages) {
    const line = edge === "first" ? lines[0] : lines.at(-1);
    if (line && line.length <= 120) {
      const key = cleanText(line).toLowerCase();
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
          cleanText(paragraph.join(" ")),
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
      const normalized = cleanText(line).toLowerCase();
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
          references = /^(?:references|bibliography)$/i.test(section);
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
