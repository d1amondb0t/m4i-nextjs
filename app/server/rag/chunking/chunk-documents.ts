import { AcceptedExtension, extensionOf } from "../../documents/upload-policy";
import { extractFile } from "./document-helper";
import {
  assertPageExtension,
  createDocumentChunkKey,
  createHashKeyDocument,
  createIndexFingerprint,
  describeDocument,
  dominantFamily,
  FAMILY_BLOCK_TYPE,
  hash,
  hashFileSha256,
  isNearDuplicate,
  joinPieces,
  minimumPassageWords,
  normalizeForDedup,
  sectionLabel,
  validateChunkConfiguration,
  wordCount,
} from "./chunk-helper";
import { groupBlocksIntoRuns, packPieces } from "./passage-assembly";
import {
  ChunkConfiguration,
  ChunkingContext,
  DEFAULT_CHUNK_CONFIG,
  DocumentChunk,
  DocumentIdentity,
  ExtractedPage,
} from "@/types/chunk-type";

type UnnumberedChunk = Omit<DocumentChunk, "number">;

export class DocumentChunker {
  constructor(
    private readonly config: ChunkConfiguration = DEFAULT_CHUNK_CONFIG,
  ) {
    validateChunkConfiguration(config);
  }

  async chunkDocuments(files: readonly File[]): Promise<DocumentChunk[]> {
    const chunkGroups = await Promise.all(
      files.map((file) => this.chunkDocument(file, this.config)),
    );
    return chunkGroups.flat();
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

  /**
   * PDF pages carry layout blocks and are assembled into passages; plain-text
   * pages have no blocks and are cut into fixed word windows.
   */
  chunkPages(
    pages: readonly ExtractedPage[],
    extension: string,
    config: ChunkConfiguration = DEFAULT_CHUNK_CONFIG,
    identity: DocumentIdentity,
  ): DocumentChunk[] {
    const context: ChunkingContext = {
      identity,
      extension,
      config,
      indexFingerprint: createIndexFingerprint(identity, extension, config),
    };
    return [
      ...passageChunks(pages, context),
      ...wordWindowChunks(pages, context),
    ].map((chunk, index) => ({ ...chunk, number: index + 1 }));
  }
}

/**
 * Group blocks into runs, pack each run into chunks of at most wordSize words,
 * drop near-duplicates, and label each chunk with its section.
 */
function passageChunks(
  pages: readonly ExtractedPage[],
  { identity, extension, config, indexFingerprint }: ChunkingContext,
): UnnumberedChunk[] {
  const document = describeDocument(pages, identity);
  const assembly = config.assembly ?? "flow";
  const chunks: UnnumberedChunk[] = [];
  const seen: string[] = [];
  let ordinal = 0;

  for (const run of groupBlocksIntoRuns(pages, config)) {
    const label = sectionLabel(run.section);
    const groups = packPieces(
      run.pieces,
      config.wordSize,
      run.family === "prose" ? config.overlapWords : 0,
      minimumPassageWords(config),
    );
    for (const group of groups) {
      ordinal += 1;
      const body = joinPieces(group);
      const normalized = normalizeForDedup(body);
      if (
        !normalized ||
        seen.some((previous) => isNearDuplicate(previous, normalized))
      )
        continue;
      seen.push(normalized);

      const text = label ? label + "\n" + body : body;
      const family = dominantFamily(group);
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
        text,
        metadata: {
          contentType: extension as AcceptedExtension,
          indexFingerprint,
          wordCount: wordCount(text),
          wordStart: first.wordStart,
          ...(pageEnd !== first.page ? { pageEnd } : {}),
          blockType: FAMILY_BLOCK_TYPE[family],
          ...(label ? { section: label } : {}),
          documentTopic: document.documentTopic,
          retrievalRole: family === "reference" ? "auxiliary" : "evidence",
          extractionQuality: group.some((piece) =>
            document.ocrPages.has(piece.page),
          )
            ? "ocr"
            : "extracted",
          quarantinedPages: document.quarantinedPages,
          quarantineReasons: document.quarantineReasons,
        },
      });
    }
  }
  return chunks;
}

/** Cut each page without layout blocks into windows of wordSize words, stepping by wordSize - overlapWords. */
function wordWindowChunks(
  pages: readonly ExtractedPage[],
  context: ChunkingContext,
): UnnumberedChunk[] {
  const { identity, extension, config, indexFingerprint } = context;
  const stepSize = config.wordSize - config.overlapWords;
  const chunks: UnnumberedChunk[] = [];

  for (const page of pages) {
    if (page.blocks) continue;
    const words = page.text.split(/\s+/).filter(Boolean);

    for (let start = 0; start < words.length; start += stepSize) {
      const currentWords = words.slice(start, start + config.wordSize);
      chunks.push({
        chunkId: hash(
          "sha1",
          createDocumentChunkKey(identity, page, extension, config, start),
        ),
        ...identity,
        page: page.page,
        text: currentWords.join(" "),
        metadata: {
          contentType: extension as AcceptedExtension,
          indexFingerprint,
          wordStart: start,
          wordCount: currentWords.length,
        },
      });

      if (start + config.wordSize >= words.length) break;
    }
  }
  return chunks;
}
