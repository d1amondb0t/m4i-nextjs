import { AcceptedExtension, extensionOf } from "../../documents/upload-policy";
import { extractFile } from "./document-helper";
import { assertPageExtension, createDocumentChunkKey, createHashKeyDocument, createIndexFingerprint, hash, hashFileSha256, validateChunkConfiguration } from "./chunk-helper";
import { ChunkConfiguration, DEFAULT_CHUNK_CONFIG, DocumentChunk, DocumentIdentity, ExtractedPage } from "@/types/chunk-type";

export class DocumentChunker {
  constructor(
    private readonly config: ChunkConfiguration = DEFAULT_CHUNK_CONFIG,
  ) {
    validateChunkConfiguration(config);
  }

  chunkPages(pages: readonly ExtractedPage[], extension: string, config: ChunkConfiguration = DEFAULT_CHUNK_CONFIG, identity: DocumentIdentity): DocumentChunk[] {

  const stepSize = config.wordSize - config.overlapWords;
  const indexFingerprint = createIndexFingerprint(identity, extension, config);

  const chunks: DocumentChunk[] = [];

  for (const page of pages) {
    const words = page.text.split(/\s+/).filter(Boolean);

    for (let start = 0; start < words.length; start += stepSize) {
      const currentWords = words.slice(start, start + config.wordSize);

      if (currentWords.length === 0) continue;


      const chunk: DocumentChunk = {
        chunkId: hash("sha1", createDocumentChunkKey(identity, page, extension, config, start)),
        ...identity,
        page: page.page,
        number: chunks.length + 1,
        text: currentWords.join(" "),
        metadata: {
          contentType: extension as AcceptedExtension,
          indexFingerprint: indexFingerprint,
          wordStart: start,
          wordCount: currentWords.length,
        }
      }

      chunks.push(chunk);

      if (start + config.wordSize >= words.length) break;
    }
  }

  return chunks;
}


  async chunkDocument(file: File, config: ChunkConfiguration = DEFAULT_CHUNK_CONFIG): Promise<DocumentChunk[]> {

    validateChunkConfiguration(config);
    
    const sourceHash = await hashFileSha256(file);
    const extension = extensionOf(file.name);

    assertPageExtension(extension);
    
    const identity: DocumentIdentity = {
      documentId: createHashKeyDocument(file, "sha1", sourceHash),
      source: file.name,
      sourceHash
    }

    // extract, clean and chunk document content
    const extractedPages = await extractFile(file, extension);
    const chunks = this.chunkPages(extractedPages, extension, config, identity);

    if (chunks.length === 0) {
      const detail = extension === "pdf" ? "; scanned PDFs require OCR" : "";
      throw new Error(`No text could be extracted from ${file.name}${detail}.`);
    }

    return chunks;
  };
  
  async chunkDocuments(files: readonly File[]): Promise<DocumentChunk[]> {
    const chunkGroups = await Promise.all(files.map((file) => this.chunkDocument(file, this.config)));
    return chunkGroups.flat();
  }
}