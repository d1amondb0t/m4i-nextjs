import { createHash } from "crypto";
import type {
  ChunkConfiguration,
  DocumentBlockType,
  DocumentIdentity,
  ExtractedPage,
  PassageFamily,
  PassagePiece,
  PassageRun,
} from "@/types/chunk-type";
import {
  AcceptedExtension,
  isAcceptedExtension,
} from "../../documents/upload-policy";

export function hash(
  algorihtm: "sha1" | "sha256",
  value: string | Uint8Array,
): string {
  return createHash(algorihtm).update(value).digest("hex");
}

export async function hashFileSha256(file: File): Promise<string> {
  return hash("sha256", new Uint8Array(await file.arrayBuffer()));
}

export function createHashKeyDocument(
  file: File,
  algorithm: "sha1" | "sha256",
  sourceHash: string,
): string {
  return hash(
    algorithm,
    `${file.name.toLocaleLowerCase("en-US")}:${sourceHash}`,
  );
}

export function createDocumentChunkKey(
  identity: DocumentIdentity,
  page: ExtractedPage,
  extension: string,
  config: ChunkConfiguration,
  start: number,
): string {
  return [
    identity.documentId,
    page.page,
    start,
    config.wordSize,
    config.overlapWords,
    extension,
  ].join(":");
}

export function createIndexFingerprint(
  identity: DocumentIdentity,
  extension: string,
  config: ChunkConfiguration,
): string {
  return hash(
    "sha1",
    [
      identity.sourceHash,
      config.wordSize,
      config.overlapWords,
      isAcceptedExtension(extension) ? extension : "",
      config.assembly ?? "flow",
      "document-processing-v2",
    ].join(":"),
  );
}

export function validateChunkConfiguration(config: ChunkConfiguration): void {
  if (!Number.isInteger(config.wordSize) || config.wordSize <= 0) {
    throw new Error("wordSize must be a positive integer.");
  }

  if (!Number.isInteger(config.overlapWords) || config.overlapWords < 0) {
    throw new Error("overlapWords must be a non-negative integer");
  }

  if (config.overlapWords >= config.wordSize) {
    throw new Error("overlapWords must be strictly smaller than wordSize");
  }

  if (
    config.assembly !== undefined &&
    !["page", "flow"].includes(config.assembly)
  ) {
    throw new Error('assembly must be "page" or "flow"');
  }
}

export function assertPageExtension(
  extension: string,
): asserts extension is AcceptedExtension {
  // Temporary includes
  if (
    !isAcceptedExtension(extension) ||
    !["pdf", "txt", "md"].includes(extension)
  ) {
    throw new Error(
      `Document type ".${extension}" is not implemented for chunking`,
    );
  }
}

/** Block types that are page furniture and never indexed. */
export const NOT_INDEXED_BLOCK_TYPES = new Set<DocumentBlockType>([
  "header",
  "footer",
]);

/** The blockType recorded on a chunk for each passage family. */
export const FAMILY_BLOCK_TYPE: Record<PassageFamily, DocumentBlockType> = {
  prose: "paragraph",
  table: "table",
  reference: "reference",
};

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Smallest passage worth emitting on its own; shorter runs absorb what follows. */
export function minimumPassageWords(config: ChunkConfiguration): number {
  return Math.min(40, Math.floor(config.wordSize / 5));
}

/** A section label worth repeating on chunks: mostly letters, a real word, heading-sized. */
export function sectionLabel(section: string | undefined): string | undefined {
  if (!section) return undefined;
  const letters = (section.match(/\p{L}/gu) ?? []).length;
  return wordCount(section) <= 12 &&
    letters / section.length >= 0.6 &&
    /\p{L}{3,}/u.test(section) &&
    !section.includes("_")
    ? section
    : undefined;
}

/**
 * Layout extraction marks any tab-separated line as a table row, so numbered
 * paragraphs ("16. | The budget…") and merged text columns look like tables.
 * Treat rows of sentence-length cells, or a marker plus text, as prose and
 * return them flattened; return undefined for a real table.
 */
export function flattenProseTable(text: string): string | undefined {
  const rows = text.split("\n").map((row) => row.split(" | "));
  const cells = rows.flat();
  const marker = /^(?:\(?[\dA-Za-z]{1,3}[.)]|[•▪◦\-–])$/;
  const markerRows = rows.filter(
    (row) => row.length === 2 && marker.test(row[0].trim()),
  ).length;
  const longCells = cells.filter((cell) => wordCount(cell) >= 5).length;
  const prose =
    markerRows * 2 >= rows.length ||
    (rows.every((row) => row.length <= 2) && longCells * 2 >= cells.length);
  return prose ? rows.map((row) => row.join(" ")).join(" ") : undefined;
}

export function countRunWords(run: PassageRun): number {
  return run.pieces.reduce((sum, piece) => sum + piece.words, 0);
}

/** The family carrying most words in a chunk. */
export function dominantFamily(pieces: readonly PassagePiece[]): PassageFamily {
  const totals = new Map<PassageFamily, number>();
  for (const piece of pieces)
    totals.set(piece.family, (totals.get(piece.family) ?? 0) + piece.words);
  return [...totals].sort((left, right) => right[1] - left[1])[0][0];
}

/** Join a chunk's pieces with spaces, breaking the line wherever a table piece starts or ends. */
export function joinPieces(pieces: readonly PassagePiece[]): string {
  return pieces
    .map((piece, index) =>
      index === 0
        ? piece.text
        : (piece.family === "table" || pieces[index - 1].family === "table"
            ? "\n"
            : " ") + piece.text,
    )
    .join("");
}

/** Lowercase and strip everything except letters and digits, so near-duplicates compare equal. */
export function normalizeForDedup(text: string): string {
  return text
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Jaccard similarity of two chunks' distinct-word sets at or above which the
 * later chunk is treated as a duplicate and dropped.
 */
export const NEAR_DUPLICATE_THRESHOLD = 0.94;

/** Two normalized texts match exactly, or both have 20+ words and share at least NEAR_DUPLICATE_THRESHOLD of their vocabulary. */
export function isNearDuplicate(left: string, right: string): boolean {
  if (left === right) return true;

  const leftWords = left.split(" ");
  const rightWords = right.split(" ");

  if (Math.min(leftWords.length, rightWords.length) < 20) return false;

  const leftSet = new Set(leftWords);
  const rightSet = new Set(rightWords);
  let intersection = 0;

  for (const word of leftSet) if (rightSet.has(word)) intersection += 1;
  return (
    intersection / (leftSet.size + rightSet.size - intersection) >=
    NEAR_DUPLICATE_THRESHOLD
  );
}

/** Document-wide facts repeated on every passage chunk. */
export function describeDocument(
  pages: readonly ExtractedPage[],
  identity: DocumentIdentity,
) {
  const quarantined = pages.filter((page) => page.quality === "quarantined");
  return {
    quarantinedPages: quarantined.map((page) => page.page),
    quarantineReasons: Object.fromEntries(
      quarantined.map((page) => [
        page.page,
        page.qualityReason ?? "unreadable after OCR",
      ]),
    ),
    // The first plausible heading that is not boilerplate, else the file name.
    documentTopic:
      pages
        .flatMap((page) => page.blocks ?? [])
        .find(
          (block) =>
            block.type === "heading" &&
            sectionLabel(block.text) &&
            !/^(?:abstract|introduction|references|bibliography)$/i.test(
              block.text,
            ),
        )?.text ?? identity.source.replace(/\.[^.]+$/, ""),
    ocrPages: new Set(
      pages.filter((page) => page.quality === "ocr").map((page) => page.page),
    ),
  };
}
