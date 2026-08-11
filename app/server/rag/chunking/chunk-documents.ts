import { createHash } from "node:crypto";

import Papa from "papaparse";
import { PDFParse } from "pdf-parse";

import { extensionOf } from "@/app/server/documents/upload-policy";

const CSV_PROCESSING_VERSION = "csv-row-v1";
const PAGE_PROCESSING_VERSION = {
  pdf: "pdf-page-v1",
  txt: "text-v1",
  md: "markdown-v1",
} as const;

type ChunkableExtension = keyof typeof PAGE_PROCESSING_VERSION | "csv";

export type ChunkingConfig = {
  sizeWords: number;
  overlapWords: number;
};

export type DocumentChunkMetadata = {
  contentType: ChunkableExtension;
  indexFingerprint: string;
  wordCount: number;
  wordStart?: number;
  rowStart?: number;
  rowEnd?: number;
  rowCount?: number;
  columns?: string[];
  delimiter?: string;
  encoding?: string;
};

export type DocumentChunk = {
  chunkId: string;
  documentId: string;
  source: string;
  sourceHash: string;
  page: number;
  number: number;
  text: string;
  metadata: DocumentChunkMetadata;
};

type ExtractedPage = {
  page: number;
  text: string;
};

type CsvRow = {
  number: number;
  text: string;
};

type ParsedCsv = {
  columns: string[];
  delimiter: string;
  encoding: string;
  rows: CsvRow[];
};

type DocumentIdentity = {
  documentId: string;
  source: string;
  sourceHash: string;
};

function hash(algorithm: "sha1" | "sha256", value: string | Uint8Array) {
  return createHash(algorithm).update(value).digest("hex");
}

async function fileSha256(file: File) {
  return hash("sha256", new Uint8Array(await file.arrayBuffer()));
}

export function cleanText(text: string) {
  return text
    .replace(/\x00/g, " ")
    .replace(/<latexit\b[\s\S]*?<\/latexit>/gi, " ")
    .replace(/(?<=\w)-\n(?=\w)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function validateConfig(config: ChunkingConfig) {
  if (!Number.isInteger(config.sizeWords) || config.sizeWords <= 0) {
    throw new Error("sizeWords must be a positive integer.");
  }

  if (!Number.isInteger(config.overlapWords) || config.overlapWords < 0) {
    throw new Error("overlapWords must be a non-negative integer.");
  }

  if (config.overlapWords >= config.sizeWords) {
    throw new Error("overlapWords must be smaller than sizeWords.");
  }
}

function assertChunkableExtension(
  extension: string,
): asserts extension is ChunkableExtension {
  if (!(extension in PAGE_PROCESSING_VERSION) && extension !== "csv") {
    throw new Error(`Unsupported document type ".${extension}".`);
  }
}

function decodeUtf8(bytes: Uint8Array, filename: string) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${filename} is not valid UTF-8 text.`, { cause: error });
  }
}

function decodeCsv(bytes: Uint8Array) {
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encoding: "utf-8",
    };
  } catch {
    return {
      text: new TextDecoder("windows-1252").decode(bytes),
      encoding: "windows-1252",
    };
  }
}

function normalizeColumns(values: readonly string[]) {
  const occurrences = new Map<string, number>();

  return values.map((value, index) => {
    const base = cleanText(value) || `Column ${index + 1}`;
    const occurrence = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, occurrence);
    return occurrence === 1 ? base : `${base} (${occurrence})`;
  });
}

function renderCsvRow(
  columns: readonly string[],
  values: readonly string[],
  rowNumber: number,
) {
  const fields = columns.map((column, index) => {
    const value = cleanText(values[index] ?? "");
    return `${column}: ${value || "(empty)"}`;
  });

  return `Row ${rowNumber} | ${fields.join(" | ")}`;
}

async function extractPages(
  file: File,
  extension: keyof typeof PAGE_PROCESSING_VERSION,
) {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (extension !== "pdf") {
    return [{
      page: 1,
      text: cleanText(decodeUtf8(bytes, file.name)),
    }];
  }

  const parser = new PDFParse({ data: bytes });

  try {
    const result = await parser.getText();
    return result.pages.map((page) => ({
      page: page.num,
      text: cleanText(page.text),
    }));
  } finally {
    await parser.destroy();
  }
}

async function parseCsv(file: File): Promise<ParsedCsv> {
  const decoded = decodeCsv(new Uint8Array(await file.arrayBuffer()));
  const result = Papa.parse<string[]>(decoded.text, {
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    throw new Error(
      `Could not parse CSV file "${file.name}": ${result.errors[0].message}`,
    );
  }

  const records = result.data;

  if (records.length === 0) {
    throw new Error(`CSV file "${file.name}" is empty.`);
  }

  const columns = normalizeColumns(records[0]);
  const rows = records.slice(1).map((values, index) => ({
    number: index + 1,
    text: renderCsvRow(columns, values, index + 1),
  }));

  if (rows.length === 0) {
    throw new Error(`CSV file "${file.name}" contains a header but no data rows.`);
  }

  return {
    columns,
    delimiter: result.meta.delimiter,
    encoding: decoded.encoding,
    rows,
  };
}

function csvChunkRanges(rows: readonly CsvRow[], config: ChunkingConfig) {
  const wordCounts = rows.map((row) => row.text.split(/\s+/).length);
  const ranges: Array<{ start: number; end: number }> = [];
  let start = 0;

  while (start < rows.length) {
    let end = start;
    let words = 0;

    while (end < rows.length) {
      const rowWords = wordCounts[end];

      if (end > start && words + rowWords > config.sizeWords) {
        break;
      }

      words += rowWords;
      end += 1;

      if (words >= config.sizeWords) {
        break;
      }
    }

    ranges.push({ start, end });

    if (end >= rows.length) {
      break;
    }

    let nextStart = end;
    let overlap = 0;

    while (nextStart > start) {
      const previousRowWords = wordCounts[nextStart - 1];

      if (overlap + previousRowWords > config.overlapWords) {
        break;
      }

      overlap += previousRowWords;
      nextStart -= 1;
    }

    start = nextStart <= start ? end : nextStart;
  }

  return ranges;
}

function chunkCsv(
  csv: ParsedCsv,
  config: ChunkingConfig,
  identity: DocumentIdentity,
) {
  const indexFingerprint = hash(
    "sha1",
    `${identity.sourceHash}:${config.sizeWords}:${config.overlapWords}:${CSV_PROCESSING_VERSION}`,
  );

  return csvChunkRanges(csv.rows, config).map((range, index) => {
    const selected = csv.rows.slice(range.start, range.end);
    const rowStart = selected[0].number;
    const rowEnd = selected.at(-1)?.number ?? rowStart;
    const chunkKey = [
      identity.documentId,
      "csv",
      rowStart,
      rowEnd,
      config.sizeWords,
      config.overlapWords,
      CSV_PROCESSING_VERSION,
    ].join(":");

    return {
      chunkId: hash("sha1", chunkKey),
      ...identity,
      page: 1,
      number: index + 1,
      text: selected.map((row) => row.text).join("\n"),
      metadata: {
        contentType: "csv" as const,
        rowStart,
        rowEnd,
        rowCount: selected.length,
        columns: csv.columns,
        delimiter: csv.delimiter,
        encoding: csv.encoding,
        wordCount: selected.reduce(
          (total, row) => total + row.text.split(/\s+/).length,
          0,
        ),
        indexFingerprint,
      },
    };
  });
}

function chunkPages(
  pages: readonly ExtractedPage[],
  extension: keyof typeof PAGE_PROCESSING_VERSION,
  config: ChunkingConfig,
  identity: DocumentIdentity,
) {
  const step = config.sizeWords - config.overlapWords;
  const processingVersion = PAGE_PROCESSING_VERSION[extension];
  const indexFingerprint = hash(
    "sha1",
    `${identity.sourceHash}:${config.sizeWords}:${config.overlapWords}:${processingVersion}`,
  );
  const chunks: DocumentChunk[] = [];

  for (const page of pages) {
    const words = page.text.split(/\s+/).filter(Boolean);

    for (let start = 0; start < words.length; start += step) {
      const selected = words.slice(start, start + config.sizeWords);

      if (selected.length === 0) {
        continue;
      }

      const chunkKey = [
        identity.documentId,
        page.page,
        start,
        config.sizeWords,
        config.overlapWords,
        processingVersion,
      ].join(":");

      chunks.push({
        chunkId: hash("sha1", chunkKey),
        ...identity,
        page: page.page,
        number: chunks.length + 1,
        text: selected.join(" "),
        metadata: {
          contentType: extension,
          wordStart: start,
          wordCount: selected.length,
          indexFingerprint,
        },
      });

      if (start + config.sizeWords >= words.length) {
        break;
      }
    }
  }

  return chunks;
}

export async function chunkDocument(file: File, config: ChunkingConfig) {
  validateConfig(config);

  const extension = extensionOf(file.name);
  assertChunkableExtension(extension);

  const sourceHash = await fileSha256(file);
  const identity = {
    documentId: hash(
      "sha1",
      `${file.name.toLocaleLowerCase("en-US")}:${sourceHash}`,
    ).slice(0, 16),
    source: file.name,
    sourceHash,
  };

  const chunks = extension === "csv"
    ? chunkCsv(await parseCsv(file), config, identity)
    : chunkPages(
        await extractPages(file, extension),
        extension,
        config,
        identity,
      );

  if (chunks.length === 0) {
    const detail = extension === "pdf" ? "; scanned PDFs require OCR" : "";
    throw new Error(`No text could be extracted from ${file.name}${detail}.`);
  }

  return chunks;
}
