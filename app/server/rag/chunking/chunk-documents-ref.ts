import { AcceptedExtension, extensionOf } from "../../documents/upload-policy";
import { extractFile, DocumentIdentity, DocumentChunk } from "./document-helper";
import { ChunkConfiguration, createDocumentChunkKey, createHashKeyDocument, hash, hashFileSha256 } from "./chunk-helper";

export const DEFAULT_CHUNK_CONFIG: ChunkConfiguration = {
  overlapWords: 50,
  wordSize: 200
} as const;


async function chunkPages(file: File, extension: string, config: ChunkConfiguration = DEFAULT_CHUNK_CONFIG, identity: DocumentIdentity): Promise<DocumentChunk[]> {

  const stepSize = config.wordSize - config.overlapWords;
  const extractedPages = await extractFile(file, extension);

  const chunks: DocumentChunk[] = [];

  for (const page of extractedPages) {
    const words = page.text.split(/\s+/).filter(Boolean);

    for (let start = 0; start < words.length; start += stepSize) {
      const currentWords = words.slice(start, start + config.wordSize);

      if (currentWords.length === 0) continue;

      //create key with chunk information
      const chunkKey = createDocumentChunkKey(identity, page, config, start);

      const chunk: DocumentChunk = {
        chunkId: hash("sha1", chunkKey),
        ...identity,
        page: page.page,
        chunkNumber: chunks.length +1,
        text:  currentWords.join(" "),
        metadata: {
          contentType: extensionOf(file.name) as AcceptedExtension,
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


export async function chunkDocument(file: File, config: ChunkConfiguration = DEFAULT_CHUNK_CONFIG) {

  // read type of document
  const extension = extensionOf(file.name);
  const identity: DocumentIdentity = {
    documentId: createHashKeyDocument(file, "sha1").slice(0, 16),
    source: file.name,
    sourceHash: await hashFileSha256(file)
  }

  // extract, clean and chunk document content
  const chunks = chunkPages(file, extension, config, identity);

    if ((await chunks).length === 0) {
      const detail = extension === "pdf" ? "; scanned PDFs require OCR" : "";
      throw new Error(`No text could be extracted from ${file.name}${detail}.`);
  }

  return chunks;
}