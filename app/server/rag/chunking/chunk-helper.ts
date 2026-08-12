import { createHash } from "crypto";
import { AcceptedExtension } from "../../documents/upload-policy";
import { DocumentIdentity } from "./document-helper";

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


export function hash(algorihtm: "sha1" | "sha256", value: string | Uint8Array): string {
  return createHash(algorihtm).update(value).digest("hex");
}

export async function hashFileSha256(file: File): Promise<string> {
  return hash("sha256", new Uint8Array(await file.arrayBuffer()));
}

export function createHashKeyDocument(file: File, algorithm: "sha1" | "sha256", sourceHash: string): string {
  return `${hash(algorithm, file.name.toLocaleLowerCase("en-US"))}:${sourceHash}` 
}

export function createDocumentChunkKey(identity: DocumentIdentity,
  page: ExtractedPage,
  config: ChunkConfiguration,
  start: number): string {
  return [
    identity.documentId,
    page.page,
    start,
    config.wordSize,
    config.overlapWords
  ].join(":");
}
