import { AcceptedExtension, extensionOf } from "../../documents/upload-policy";
import { extractFile } from "./document-helper";
import {
  assertPageExtension,
  createDocumentChunkKey,
  createHashKeyDocument,
  createIndexFingerprint,
  hash,
  hashFileSha256,
  validateChunkConfiguration,
} from "./chunk-helper";
import {
  ChunkConfiguration,
  DEFAULT_CHUNK_CONFIG,
  DocumentBlockType,
  DocumentChunk,
  DocumentIdentity,
  ExtractedBlock,
  ExtractedPage,
} from "@/types/chunk-type";

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Split a table into row groups of at most wordSize words, repeating the header row in each group. */
function splitTable(text: string, wordSize: number): string[] {
  const [header, ...rows] = text.split("\n");
  const groups: string[] = [];
  let current = [header];
  for (const row of rows) {
    if (
      wordCount([...current, row].join(" ")) > wordSize &&
      current.length > 1
    ) {
      groups.push(current.join("\n"));
      current = [header];
    }
    current.push(row);
  }
  groups.push(current.join("\n"));
  return groups;
}

function normalizeForDedup(text: string): string {
  return text
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function nearDuplicate(left: string, right: string): boolean {
  if (left === right) return true;
  const leftWords = left.split(" ");
  const rightWords = right.split(" ");
  if (Math.min(leftWords.length, rightWords.length) < 20) return false;
  const leftSet = new Set(leftWords);
  const rightSet = new Set(rightWords);
  let intersection = 0;
  for (const word of leftSet) if (rightSet.has(word)) intersection += 1;
  return intersection / (leftSet.size + rightSet.size - intersection) >= 0.94;
}

type Family = "prose" | "table" | "reference";
type Piece = {
  text: string;
  page: number;
  wordStart: number;
  words: number;
  family: Family;
};
type Run = { family: Family; section?: string; pieces: Piece[] };

const NOT_INDEXED = new Set<DocumentBlockType>(["header", "footer"]);
const FAMILY_BLOCK_TYPE: Record<Family, DocumentBlockType> = {
  prose: "paragraph",
  table: "table",
  reference: "reference",
};

/** Smallest passage worth emitting on its own; shorter runs absorb what follows. */
function minimumWords(config: ChunkConfiguration): number {
  return Math.min(40, Math.floor(config.wordSize / 5));
}

/** A section label worth repeating on chunks: mostly letters, a real word, heading-sized. */
function sectionLabel(section: string | undefined): string | undefined {
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
 * Treat rows of sentence-length cells, or a marker plus text, as prose.
 */
function proseTableText(text: string): string | undefined {
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

function blockPieces(
  block: ExtractedBlock,
  family: Family,
  wordStart: number,
  config: ChunkConfiguration,
): Piece[] {
  const pieces: Piece[] = [];
  let offset = wordStart;
  const parts =
    block.type === "table"
      ? splitTable(block.text, config.wordSize)
      : block.type === "caption"
        ? [block.text]
        : block.text.split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}"“(])/u);
  for (const part of parts) {
    const words = part.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    if (block.type === "table" || words.length <= config.wordSize) {
      pieces.push({
        text: part,
        page: block.page,
        wordStart: offset,
        words: words.length,
        family,
      });
    } else {
      // A sentence longer than a chunk falls back to bounded word windows.
      const overlap = Math.min(
        config.overlapWords,
        Math.floor(config.wordSize / 4),
      );
      for (
        let start = 0;
        start < words.length;
        start += config.wordSize - overlap
      ) {
        const window = words.slice(start, start + config.wordSize);
        pieces.push({
          text: window.join(" "),
          page: block.page,
          wordStart: offset + start,
          words: window.length,
          family,
        });
        if (start + config.wordSize >= words.length) break;
      }
    }
    if (block.type !== "table") offset += words.length;
  }
  return pieces;
}

function runWords(run: Run): number {
  return run.pieces.reduce((sum, piece) => sum + piece.words, 0);
}

/**
 * Group indexable blocks into runs of one family under one section, in reading
 * order. A run shorter than the minimum absorbs the next heading or block even
 * across a section or family change, so short sections do not become fragments.
 */
function buildRuns(
  pages: readonly ExtractedPage[],
  config: ChunkConfiguration,
): Run[] {
  const runs: Run[] = [];
  const minimum = minimumWords(config);
  const flow = (config.assembly ?? "flow") === "flow";
  let closed = true;
  for (const page of pages) {
    const blocks = (page.blocks ?? []).map((block) => {
      const prose =
        block.type === "table" ? proseTableText(block.text) : undefined;
      return prose
        ? { ...block, type: "paragraph" as const, text: prose }
        : block;
    });
    let pageWordStart = 0;
    for (const [index, block] of blocks.entries()) {
      const start = pageWordStart;
      pageWordStart += wordCount(block.text);
      if (NOT_INDEXED.has(block.type) || !/\p{L}/u.test(block.text)) continue;
      const last = runs.at(-1);
      const samePage = flow || last?.pieces.at(-1)?.page === page.page;
      const small =
        !closed && last !== undefined && samePage && runWords(last) < minimum;
      if (block.type === "heading") {
        if (small) {
          last.pieces.push({
            text: block.text,
            page: block.page,
            wordStart: start,
            words: wordCount(block.text),
            family: "prose",
          });
        } else closed = true;
        continue;
      }
      const family: Family =
        block.type === "table" ||
        (block.type === "caption" && blocks[index + 1]?.type === "table")
          ? "table"
          : block.type === "reference"
            ? "reference"
            : "prose";
      const pieces = blockPieces(block, family, start, config);
      if (
        last !== undefined &&
        (small ||
          (!closed &&
            samePage &&
            last.family === family &&
            last.section === block.section))
      ) {
        last.pieces.push(...pieces);
      } else {
        runs.push({ family, section: block.section, pieces });
      }
      closed = false;
    }
  }
  return runs.filter((run) => run.pieces.length > 0);
}

/** The family carrying most words in a chunk. */
function dominantFamily(pieces: readonly Piece[]): Family {
  const totals = new Map<Family, number>();
  for (const piece of pieces)
    totals.set(piece.family, (totals.get(piece.family) ?? 0) + piece.words);
  return [...totals].sort((left, right) => right[1] - left[1])[0][0];
}

/** Pack pieces into chunks of at most wordSize words, carrying whole trailing pieces as overlap. */
function packPieces(
  pieces: Piece[],
  wordSize: number,
  overlapWords: number,
  minimum: number,
): Piece[][] {
  const groups: Piece[][] = [];
  let current: Piece[] = [];
  let words = 0;
  for (const piece of pieces) {
    if (current.length && words + piece.words > wordSize) {
      groups.push(current);
      const carry: Piece[] = [];
      let carried = 0;
      for (let index = current.length - 1; index >= 0; index -= 1) {
        if (carried + current[index].words > overlapWords) break;
        carry.unshift(current[index]);
        carried += current[index].words;
      }
      // Never let overlap alone fill the next chunk.
      if (carried + piece.words > wordSize) {
        carry.length = 0;
        carried = 0;
      }
      current = carry;
      words = carried;
    }
    current.push(piece);
    words += piece.words;
  }
  if (current.length) groups.push(current);

  // Fold a short final tail into the previous chunk instead of emitting a fragment.
  const previous = groups.at(-2);
  const tail = groups.at(-1);
  if (previous && tail) {
    const fresh = tail.filter((piece) => !previous.includes(piece));
    const freshWords = fresh.reduce((sum, piece) => sum + piece.words, 0);
    const previousWords = previous.reduce((sum, piece) => sum + piece.words, 0);
    if (
      freshWords < minimum &&
      previousWords + freshWords <= wordSize + minimum
    ) {
      groups.pop();
      previous.push(...fresh);
    }
  }
  return groups;
}

export class DocumentChunker {
  constructor(
    private readonly config: ChunkConfiguration = DEFAULT_CHUNK_CONFIG,
  ) {
    validateChunkConfiguration(config);
  }

  chunkPages(
    pages: readonly ExtractedPage[],
    extension: string,
    config: ChunkConfiguration = DEFAULT_CHUNK_CONFIG,
    identity: DocumentIdentity,
  ): DocumentChunk[] {
    const stepSize = config.wordSize - config.overlapWords;
    const indexFingerprint = createIndexFingerprint(
      identity,
      extension,
      config,
    );

    const chunks: DocumentChunk[] = [];
    const seen: string[] = [];
    const quarantinedPages = pages
      .filter((page) => page.quality === "quarantined")
      .map((page) => page.page);
    const quarantineReasons = Object.fromEntries(
      pages
        .filter((page) => page.quality === "quarantined")
        .map((page) => [
          page.page,
          page.qualityReason ?? "unreadable after OCR",
        ]),
    );
    const documentTopic =
      pages
        .flatMap((page) => page.blocks ?? [])
        .find(
          (block) =>
            block.type === "heading" &&
            sectionLabel(block.text) &&
            !/^(?:abstract|introduction|references|bibliography)$/i.test(
              block.text,
            ),
        )?.text ?? identity.source.replace(/\.[^.]+$/, "");
    const ocrPages = new Set(
      pages.filter((page) => page.quality === "ocr").map((page) => page.page),
    );
    const assembly = config.assembly ?? "flow";

    let ordinal = 0;
    for (const run of buildRuns(pages, config)) {
      const label = sectionLabel(run.section);
      const groups = packPieces(
        run.pieces,
        config.wordSize,
        run.family === "prose" ? config.overlapWords : 0,
        minimumWords(config),
      );
      for (const group of groups) {
        ordinal += 1;
        const body = group
          .map((piece, index) =>
            index === 0
              ? piece.text
              : (piece.family === "table" || group[index - 1].family === "table"
                  ? "\n"
                  : " ") + piece.text,
          )
          .join("");
        const family = dominantFamily(group);
        const normalized = normalizeForDedup(body);
        if (
          !normalized ||
          seen.some((previous) => nearDuplicate(previous, normalized))
        )
          continue;
        seen.push(normalized);
        const text = label ? label + "\n" + body : body;
        const first = group[0];
        const pageEnd = group.at(-1)!.page;
        chunks.push({
          chunkId: hash(
            "sha1",
            [
              identity.documentId,
              first.page,
              ordinal,
              config.wordSize,
              config.overlapWords,
              extension,
              `structured-v2-${assembly}`,
            ].join(":"),
          ),
          ...identity,
          page: first.page,
          number: chunks.length + 1,
          text,
          metadata: {
            contentType: extension as AcceptedExtension,
            indexFingerprint,
            wordCount: wordCount(text),
            wordStart: first.wordStart,
            ...(pageEnd !== first.page ? { pageEnd } : {}),
            blockType: FAMILY_BLOCK_TYPE[family],
            ...(label ? { section: label } : {}),
            documentTopic,
            retrievalRole: family === "reference" ? "auxiliary" : "evidence",
            extractionQuality: group.some((piece) => ocrPages.has(piece.page))
              ? "ocr"
              : "extracted",
            quarantinedPages,
            quarantineReasons,
          },
        });
      }
    }

    for (const page of pages) {
      if (page.blocks) continue;
      const words = page.text.split(/\s+/).filter(Boolean);

      for (let start = 0; start < words.length; start += stepSize) {
        const currentWords = words.slice(start, start + config.wordSize);

        if (currentWords.length === 0) continue;

        const chunk: DocumentChunk = {
          chunkId: hash(
            "sha1",
            createDocumentChunkKey(identity, page, extension, config, start),
          ),
          ...identity,
          page: page.page,
          number: chunks.length + 1,
          text: currentWords.join(" "),
          metadata: {
            contentType: extension as AcceptedExtension,
            indexFingerprint: indexFingerprint,
            wordStart: start,
            wordCount: currentWords.length,
          },
        };

        chunks.push(chunk);

        if (start + config.wordSize >= words.length) break;
      }
    }

    return chunks;
  }

  async chunkDocument(
    file: File,
    config: ChunkConfiguration = DEFAULT_CHUNK_CONFIG,
  ): Promise<DocumentChunk[]> {
    validateChunkConfiguration(config);

    const sourceHash = await hashFileSha256(file);
    const extension = extensionOf(file.name);

    assertPageExtension(extension);

    const identity: DocumentIdentity = {
      documentId: createHashKeyDocument(file, "sha1", sourceHash),
      source: file.name,
      sourceHash,
    };

    // extract, clean and chunk document content
    const extractedPages = await extractFile(file, extension);
    const chunks = this.chunkPages(extractedPages, extension, config, identity);

    if (chunks.length === 0) {
      const detail = extension === "pdf" ? "; scanned PDFs require OCR" : "";
      throw new Error(`No text could be extracted from ${file.name}${detail}.`);
    }

    return chunks;
  }

  async chunkDocuments(files: readonly File[]): Promise<DocumentChunk[]> {
    const chunkGroups = await Promise.all(
      files.map((file) => this.chunkDocument(file, this.config)),
    );
    return chunkGroups.flat();
  }
}
