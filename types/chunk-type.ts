import { AcceptedExtension } from "@/app/server/documents/upload-policy";

export type ExtractedPage = {
  page: number;
  text: string;
  blocks?: ExtractedBlock[];
  quality?: "extracted" | "ocr" | "quarantined";
  qualityReason?: string;
};

export type DocumentBlockType =
  | "heading"
  | "paragraph"
  | "table"
  | "caption"
  | "reference"
  | "header"
  | "footer";

export type ExtractedBlock = {
  page: number;
  type: DocumentBlockType;
  text: string;
  section?: string;
};

export type ChunkConfiguration = {
  overlapWords: number;
  wordSize: number;
};

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
  blockType?: DocumentBlockType;
  section?: string;
  documentTopic?: string;
  retrievalRole?: "evidence" | "auxiliary";
  extractionQuality?: "extracted" | "ocr";
  quarantinedPages?: number[];
  quarantineReasons?: Record<number, string>;
};

export type DocumentIdentity = {
  documentId: string;
  source: string;
  sourceHash: string;
};

export type DocumentChunk = DocumentIdentity & {
  chunkId: string;
  page: number;
  number: number;
  text: string;
  metadata: DocumentChunkMetadata;
};

export const DEFAULT_CHUNK_CONFIG: ChunkConfiguration = {
  overlapWords: 50,
  wordSize: 200,
} as const;

export function getContextLabel(chunk: DocumentChunk): string {
  const safeSource = chunk.source.replaceAll("]", "").replaceAll("\n", " ");

  if (chunk.metadata.contentType == "csv") {
    const rowStart = chunk.metadata.rowStart ?? 1;
    const rowEnd = chunk.metadata.rowEnd ?? rowStart;
    const location =
      rowStart === rowEnd ? `Row ${rowStart}` : `Row ${rowStart}-${rowEnd}`;

    return `${location} | Source: ${safeSource}`;
  }

  return `[Page ${chunk.page}] [Source: ${safeSource}]`;
}
