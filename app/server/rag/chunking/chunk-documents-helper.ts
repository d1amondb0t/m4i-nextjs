import {
  createDocumentChunkKey,
  createPassageChunkKey,
  describeDocument,
  dominantFamily,
  FAMILY_BLOCK_TYPE,
  hash,
  isNearDuplicate,
  joinPieces,
  minimumPassageWords,
  normalizeForDedup,
  sectionLabel,
  wordCount,
} from "./chunk-helper";
import { groupBlocksIntoRuns, packPieces } from "./passage-assembly";
import {
  ChunkConfiguration,
  ChunkingContext,
  DocumentDescription,
  ExtractedPage,
  PassagePiece,
  PassageRun,
  UnnumberedChunk,
} from "@/types/chunk-type";

function packRun(
  run: PassageRun,
  config: ChunkConfiguration,
): PassagePiece[][] {
  return packPieces(
    run.pieces,
    config.wordSize,
    run.family === "prose" ? config.overlapWords : 0,
    minimumPassageWords(config),
  );
}

function extractionQuality(
  group: readonly PassagePiece[],
  ocrPages: ReadonlySet<number>,
): "ocr" | "extracted" {
  return group.some((piece) => ocrPages.has(piece.page)) ? "ocr" : "extracted";
}

function passageChunk(
  group: PassagePiece[],
  body: string,
  label: string | undefined,
  ordinal: number,
  document: DocumentDescription,
  { identity, extension, config, indexFingerprint }: ChunkingContext,
): UnnumberedChunk {
  const text = label ? label + "\n" + body : body;
  const family = dominantFamily(group);
  const first = group[0];
  const pageEnd = group.at(-1)!.page;
  return {
    chunkId: hash(
      "sha1",
      createPassageChunkKey(identity, first.page, ordinal, extension, config),
    ),
    ...identity,
    page: first.page,
    text,
    metadata: {
      contentType: extension,
      indexFingerprint,
      wordCount: wordCount(text),
      wordStart: first.wordStart,
      ...(pageEnd !== first.page ? { pageEnd } : {}),
      blockType: FAMILY_BLOCK_TYPE[family],
      ...(label ? { section: label } : {}),
      documentTopic: document.documentTopic,
      retrievalRole: family === "reference" ? "auxiliary" : "evidence",
      extractionQuality: extractionQuality(group, document.ocrPages),
      quarantinedPages: document.quarantinedPages,
      quarantineReasons: document.quarantineReasons,
    },
  };
}

export function passageChunks(
  pages: readonly ExtractedPage[],
  context: ChunkingContext,
): UnnumberedChunk[] {
  const document = describeDocument(pages, context.identity);
  const chunks: UnnumberedChunk[] = [];
  const seen: string[] = [];
  let ordinal = 0;

  for (const run of groupBlocksIntoRuns(pages, context.config)) {
    const label = sectionLabel(run.section);
    for (const group of packRun(run, context.config)) {
      ordinal += 1;
      const body = joinPieces(group);
      const normalized = normalizeForDedup(body);
      if (
        !normalized ||
        seen.some((previous) => isNearDuplicate(previous, normalized))
      )
        continue;
      seen.push(normalized);
      chunks.push(passageChunk(group, body, label, ordinal, document, context));
    }
  }
  return chunks;
}

export function wordWindowChunks(
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
          contentType: extension,
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
