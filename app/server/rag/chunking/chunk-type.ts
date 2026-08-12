import { AcceptedExtension } from "../../documents/upload-policy";

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