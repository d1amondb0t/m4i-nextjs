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

export type PassageFamily = "prose" | "table" | "reference";

/** The smallest unit packed into a chunk: a sentence, word window, caption or table row group. */
export type PassagePiece = {
  text: string;
  page: number;
  wordStart: number;
  words: number;
  family: PassageFamily;
};

export type PassageRun = {
  family: PassageFamily;
  section?: string;
  pieces: PassagePiece[];
};

export type ChunkConfiguration = {
  overlapWords: number;
  wordSize: number;
  /**
   * "flow" (default) continues passages across pages and records pageEnd;
   * "page" packs structured blocks within a page.
   */
  assembly?: "page" | "flow";
};

export type DocumentChunkMetadata = {
  contentType: AcceptedExtension;
  indexFingerprint: string;
  wordCount: number;
  wordStart?: number;
  pageEnd?: number;
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

export type DocumentDescription = {
  quarantinedPages: number[];
  quarantineReasons: Record<number, string>;
  documentTopic: string;
  ocrPages: Set<number>;
};

export type ChunkingContext = {
  identity: DocumentIdentity;
  extension: AcceptedExtension;
  config: ChunkConfiguration;
  indexFingerprint: string;
};

export type DocumentChunk = DocumentIdentity & {
  chunkId: string;
  page: number;
  number: number;
  text: string;
  metadata: DocumentChunkMetadata;
};

export type UnnumberedChunk = Omit<DocumentChunk, "number">;

export const DEFAULT_CHUNK_CONFIG: ChunkConfiguration = {
  overlapWords: 50,
  wordSize: 200,
  assembly: "flow",
} as const;
