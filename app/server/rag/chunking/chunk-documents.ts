import { AcceptedExtension, extensionOf } from "../../documents/upload-policy";
import { extractFile } from "./document-helper";
import {
  assertPageExtension,
  createHashKeyDocument,
  createIndexFingerprint,
  hashFileSha256,
  validateChunkConfiguration,
} from "./chunk-helper";
import { passageChunks, wordWindowChunks } from "./chunk-documents-helper";
import {
  ChunkConfiguration,
  ChunkingContext,
  DEFAULT_CHUNK_CONFIG,
  DocumentChunk,
  DocumentIdentity,
  ExtractedPage,
} from "@/types/chunk-type";

export class DocumentChunker {
  constructor(
    private readonly config: ChunkConfiguration = DEFAULT_CHUNK_CONFIG,
  ) {
    validateChunkConfiguration(config);
  }

  async chunkDocuments(files: readonly File[]): Promise<DocumentChunk[]> {
    const chunkGroups = await Promise.all(
      files.map((file) => this.chunkDocument(file)),
    );
    return chunkGroups.flat();
  }

  private async chunkDocument(file: File): Promise<DocumentChunk[]> {
    const sourceHash = await hashFileSha256(file);
    const extension = extensionOf(file.name);

    assertPageExtension(extension);

    const identity: DocumentIdentity = {
      documentId: createHashKeyDocument(file, "sha1", sourceHash),
      source: file.name,
      sourceHash,
    };

    const extractedPages = await extractFile(file, extension);
    const chunks = this.chunkPages(extractedPages, extension, identity);

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
    extension: AcceptedExtension,
    identity: DocumentIdentity,
    config: ChunkConfiguration = this.config,
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
