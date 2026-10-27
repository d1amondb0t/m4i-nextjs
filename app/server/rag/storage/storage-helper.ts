import type { DocumentChunk } from "@/types/chunk-type";
import type { RetrievalScope } from "@/types/retrieval-types";
import {
  QdrantCloudStorageConfiguration,
  StorageConfiguration,
} from "./storage-types";
import { v5 as uuidv5 } from "uuid";

// node -e "console.log(require('node:crypto').randomUUID())"
const POINT_NAMESPACE = "47129d6b-906b-4c39-98fd-76c3ac5a0060";

export function isCloudInstance(
  config: StorageConfiguration,
): config is QdrantCloudStorageConfiguration {
  return typeof config.url === "string";
}

export function pointId(chunk: DocumentChunk): string {
  return uuidv5(chunk.chunkId, POINT_NAMESPACE);
}

export function retrievalFilter(scope: RetrievalScope | undefined) {
  const must = [];

  if (scope?.documentIds) {
    must.push({ key: "documentId", match: { any: [...scope.documentIds] } });
  }

  if (scope?.indexFingerprints) {
    must.push({
      key: "metadata.indexFingerprint",
      match: { any: [...scope.indexFingerprints] },
    });
  }

  // Headers, footers and references are rarely evidence; chunks indexed
  // before retrievalRole existed have no role and are kept.
  const mustNot = scope?.includeAuxiliary
    ? []
    : [{ key: "metadata.retrievalRole", match: { value: "auxiliary" } }];

  return must.length || mustNot.length
    ? {
        ...(must.length ? { must } : {}),
        ...(mustNot.length ? { must_not: mustNot } : {}),
      }
    : undefined;
}

export function scopeIsEmpty(scope: RetrievalScope | undefined): boolean {
  return Boolean(
    scope &&
    (scope.documentIds?.length === 0 || scope.indexFingerprints?.length === 0),
  );
}
