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
  algorithm: "sha1" | "sha256",
  value: string | Uint8Array,
): string {
  return createHash(algorithm).update(value).digest("hex");
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

export const NOT_INDEXED_BLOCK_TYPES = new Set<DocumentBlockType>([
  "header",
  "footer",
]);

export const FAMILY_BLOCK_TYPE: Record<PassageFamily, DocumentBlockType> = {
  prose: "paragraph",
  table: "table",
  reference: "reference",
};

export const NEAR_DUPLICATE_THRESHOLD = 0.94;

const NEAR_DUPLICATE_MIN_WORDS = 20;

const BOILERPLATE_HEADING =
  /^(?:abstract|introduction|references|bibliography)$/i;

const LIST_MARKER = /^(?:\(?[\dA-Za-z]{1,3}[.)]|[•▪◦\-–])$/;

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function minimumPassageWords(config: ChunkConfiguration): number {
  return Math.min(40, Math.floor(config.wordSize / 5));
}

function letterRatio(text: string): number {
  return (text.match(/\p{L}/gu) ?? []).length / text.length;
}

function isHeadingLike(text: string): boolean {
  return (
    wordCount(text) <= 12 &&
    letterRatio(text) >= 0.6 &&
    /\p{L}{3,}/u.test(text) &&
    !text.includes("_")
  );
}

export function sectionLabel(section: string | undefined): string | undefined {
  return section && isHeadingLike(section) ? section : undefined;
}

function isMarkerRow(row: string[]): boolean {
  return row.length === 2 && LIST_MARKER.test(row[0].trim());
}

function hasMostlySentenceCells(rows: string[][]): boolean {
  const cells = rows.flat();
  const longCells = cells.filter((cell) => wordCount(cell) >= 5).length;
  return rows.every((row) => row.length <= 2) && longCells * 2 >= cells.length;
}

function isProseTable(rows: string[][]): boolean {
  const markerRows = rows.filter(isMarkerRow).length;
  return markerRows * 2 >= rows.length || hasMostlySentenceCells(rows);
}

/**
 * Layout extraction marks any tab-separated line as a table row, so numbered
 * paragraphs ("16. | The budget…") and merged text columns look like tables.
 * Returns such prose flattened, or undefined for a real table.
 */
export function flattenProseTable(text: string): string | undefined {
  const rows = text.split("\n").map((row) => row.split(" | "));
  return isProseTable(rows)
    ? rows.map((row) => row.join(" ")).join(" ")
    : undefined;
}

export function sumPieceWords(pieces: readonly PassagePiece[]): number {
  return pieces.reduce((sum, piece) => sum + piece.words, 0);
}

export function countRunWords(run: PassageRun): number {
  return sumPieceWords(run.pieces);
}

export function dominantFamily(pieces: readonly PassagePiece[]): PassageFamily {
  const totals = new Map<PassageFamily, number>();
  for (const piece of pieces)
    totals.set(piece.family, (totals.get(piece.family) ?? 0) + piece.words);
  return [...totals].sort((left, right) => right[1] - left[1])[0][0];
}

function pieceSeparator(previous: PassagePiece, piece: PassagePiece): string {
  return piece.family === "table" || previous.family === "table" ? "\n" : " ";
}

export function joinPieces(pieces: readonly PassagePiece[]): string {
  return pieces
    .map((piece, index) =>
      index === 0
        ? piece.text
        : pieceSeparator(pieces[index - 1], piece) + piece.text,
    )
    .join("");
}

export function normalizeForDedup(text: string): string {
  return text
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  let intersection = 0;
  for (const word of left) if (right.has(word)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

export function isNearDuplicate(left: string, right: string): boolean {
  if (left === right) return true;

  const leftWords = left.split(" ");
  const rightWords = right.split(" ");

  if (Math.min(leftWords.length, rightWords.length) < NEAR_DUPLICATE_MIN_WORDS)
    return false;

  return (
    jaccardSimilarity(new Set(leftWords), new Set(rightWords)) >=
    NEAR_DUPLICATE_THRESHOLD
  );
}

function quarantineReasons(
  quarantined: readonly ExtractedPage[],
): Record<number, string> {
  return Object.fromEntries(
    quarantined.map((page) => [
      page.page,
      page.qualityReason ?? "unreadable after OCR",
    ]),
  );
}

function documentTopic(
  pages: readonly ExtractedPage[],
  identity: DocumentIdentity,
): string {
  const heading = pages
    .flatMap((page) => page.blocks ?? [])
    .find(
      (block) =>
        block.type === "heading" &&
        sectionLabel(block.text) &&
        !BOILERPLATE_HEADING.test(block.text),
    );
  return heading?.text ?? identity.source.replace(/\.[^.]+$/, "");
}

export function describeDocument(
  pages: readonly ExtractedPage[],
  identity: DocumentIdentity,
) {
  const quarantined = pages.filter((page) => page.quality === "quarantined");
  return {
    quarantinedPages: quarantined.map((page) => page.page),
    quarantineReasons: quarantineReasons(quarantined),
    documentTopic: documentTopic(pages, identity),
    ocrPages: new Set(
      pages.filter((page) => page.quality === "ocr").map((page) => page.page),
    ),
  };
}
