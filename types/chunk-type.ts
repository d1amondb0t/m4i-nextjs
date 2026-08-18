import { AcceptedExtension } from "@/app/server/documents/upload-policy";


export type ExtractedPage = {
  page: number,
  text: string
};

export type ChunkConfiguration = {
  overlapWords: number;
  wordSize: number;
}

export type DocumentChunkMetadata = {
  contentType: AcceptedExtension;
  indexFingerprint: string;
  wordCount: number;
  wordStart?: number;
  rowStart?: number;
  rowEnd?: number;
  rowCount?: number;
  columns?: string[];
  delimiter?: string;
  encoding?: string;
}

export type DocumentIdentity = {
  documentId: string;
  source: string;
  sourceHash: string;
}

export type DocumentChunk =  DocumentIdentity & {
  chunkId: string;
  page: number;
  number: number;
  text: string;
  metadata: DocumentChunkMetadata;
};


export function getContextLabel(chunk: DocumentChunk): string {
  const safeSource = chunk.source
    .replaceAll("]", "")
    .replaceAll("\n", " ");

  if (chunk.metadata.contentType == "csv") {
    const rowStart = chunk.metadata.rowStart ?? 1;
    const rowEnd = chunk.metadata.rowEnd ?? rowStart;
    const location = rowStart === rowEnd ? `Row ${rowStart}` : `Row ${rowStart}-${rowEnd}`;

    return `${location} | Source: ${safeSource}`;
  }

  return `[Page ${chunk.page}] [Source: ${safeSource}]`;

}