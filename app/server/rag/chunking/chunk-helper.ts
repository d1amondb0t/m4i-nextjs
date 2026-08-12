import { createHash } from "crypto";
import { ChunkConfiguration, DocumentIdentity, ExtractedPage } from "./chunk-type";
import { AcceptedExtension, isAcceptedExtension } from "../../documents/upload-policy";


export function hash(algorihtm: "sha1" | "sha256", value: string | Uint8Array): string {
  return createHash(algorihtm).update(value).digest("hex");
}

export async function hashFileSha256(file: File): Promise<string> {
  return hash("sha256", new Uint8Array(await file.arrayBuffer()));
}

export function createHashKeyDocument(file: File, algorithm: "sha1" | "sha256", sourceHash: string): string {
  return hash(algorithm, `${file.name.toLocaleLowerCase("en-US")}:${sourceHash}`);
}

export function createDocumentChunkKey(
  identity: DocumentIdentity,
  page: ExtractedPage,
  extension: string,
  config: ChunkConfiguration,
  start: number
): string {
  return [
    identity.documentId,
    page.page,
    start,
    config.wordSize,
    config.overlapWords,
    extension
  ].join(":");
}

export function createIndexFingerprint(
  identity: DocumentIdentity,
  extension: string,
  config: ChunkConfiguration,
): string {
  return hash(
    "sha1",
    [
      identity.sourceHash,
      config.wordSize,
      config.overlapWords,
      isAcceptedExtension(extension)? extension : "",
    ].join(":"),
  );
}

export function validateChunkConfiguration(config: ChunkConfiguration): void {
  if (!Number.isInteger(config.wordSize) || config.wordSize <= 0) {
    throw new Error("wordSize must be a positive integer.");
  }

  if (!Number.isInteger(config.overlapWords) || config.overlapWords < 0) {
    throw new Error("overlapWords must be a non-negative integer");
  }

  if (config.overlapWords >= config.wordSize) {
    throw new Error("overlapWords must be strictly smaller than wordSize");
  }
}

export function assertPageExtension(extension:string): asserts extension is AcceptedExtension {
  // Temporary includes
  if (!isAcceptedExtension(extension) || !["pdf", "txt", "md"].includes(extension)) {
    throw new Error(`Document type ".${extension}" is not implemented for chunking`);
  }
}