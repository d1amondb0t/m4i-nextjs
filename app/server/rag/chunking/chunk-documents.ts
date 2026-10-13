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
  DocumentChunk,
  DocumentIdentity,
  ExtractedBlock,
  ExtractedPage,
} from "@/types/chunk-type";

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function splitBlock(
  block: ExtractedBlock,
  config: ChunkConfiguration,
): string[] {
  if (block.type === "table") {
    const rows = block.text.split("\n");
    const header = rows[0];
    const groups: string[] = [];
    let current = [header];
    for (const row of rows.slice(1)) {
      if (
        wordCount([...current, row].join(" ")) > config.wordSize &&
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

  const words = block.text.split(/\s+/).filter(Boolean);
  if (words.length <= config.wordSize) return [block.text];
  const sentences = block.text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  if (
    sentences.length > 1 &&
    sentences.every((sentence) => wordCount(sentence) <= config.wordSize)
  ) {
    const groups: string[] = [];
    let current = "";
    for (const sentence of sentences) {
      if (current && wordCount(current + " " + sentence) > config.wordSize) {
        groups.push(current);
        current = "";
      }
      current = current ? current + " " + sentence : sentence;
    }
    if (current) groups.push(current);
    return groups;
  }

  // When punctuation is missing, use a bounded word fallback with limited overlap.
  const overlap = Math.min(
    config.overlapWords,
    Math.floor(config.wordSize / 4),
  );
  const segments: string[] = [];
  for (
    let start = 0;
    start < words.length;
    start += config.wordSize - overlap
  ) {
    segments.push(words.slice(start, start + config.wordSize).join(" "));
    if (start + config.wordSize >= words.length) break;
  }
  return segments;
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
            !/^(?:abstract|introduction|references|bibliography)$/i.test(
              block.text,
            ),
        )?.text ?? identity.source.replace(/\.[^.]+$/, "");

    for (const page of pages) {
      if (page.blocks) {
        let pageWordStart = 0;
        for (const [blockIndex, block] of page.blocks.entries()) {
          let segmentWordStart = 0;
          let previousWords: string[] = [];
          for (const [segmentIndex, segment] of splitBlock(
            block,
            config,
          ).entries()) {
            const segmentWords = segment.split(/\s+/).filter(Boolean);
            if (segmentIndex > 0) {
              let shared = 0;
              while (
                shared < previousWords.length &&
                shared < segmentWords.length &&
                previousWords[previousWords.length - shared - 1] ===
                  segmentWords[shared]
              ) {
                shared += 1;
              }
              segmentWordStart += previousWords.length - shared;
            }
            previousWords = segmentWords;
            const text =
              block.section && block.type !== "heading"
                ? block.section + "\n" + segment
                : segment;
            const normalized = normalizeForDedup(text);
            if (
              !normalized ||
              seen.some((previous) => nearDuplicate(previous, normalized))
            )
              continue;
            seen.push(normalized);
            chunks.push({
              chunkId: hash(
                "sha1",
                [
                  identity.documentId,
                  page.page,
                  blockIndex,
                  segmentIndex,
                  config.wordSize,
                  config.overlapWords,
                  extension,
                  "structured-v1",
                ].join(":"),
              ),
              ...identity,
              page: page.page,
              number: chunks.length + 1,
              text,
              metadata: {
                contentType: extension as AcceptedExtension,
                indexFingerprint,
                wordCount: wordCount(text),
                wordStart: pageWordStart + segmentWordStart,
                blockType: block.type,
                section: block.section,
                documentTopic,
                retrievalRole: ["reference", "header", "footer"].includes(
                  block.type,
                )
                  ? "auxiliary"
                  : "evidence",
                extractionQuality: page.quality === "ocr" ? "ocr" : "extracted",
                quarantinedPages,
                quarantineReasons,
              },
            });
          }
          pageWordStart += wordCount(block.text);
        }
        continue;
      }
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
