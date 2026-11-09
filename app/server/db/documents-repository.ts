import type { DatabaseSync } from "node:sqlite";

import type { DocumentRecord } from "@/types/feedback-types";
import { now } from "./database.ts";

export function recordDocuments(
  db: DatabaseSync,
  documents: readonly DocumentRecord[],
): void {
  const statement = db.prepare(
    `INSERT INTO documents
       (document_id, user_id, collection, file_name, source_hash, index_fingerprint, chunk_count, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (collection, document_id, index_fingerprint)
     DO UPDATE SET file_name = excluded.file_name, chunk_count = excluded.chunk_count, uploaded_at = excluded.uploaded_at`,
  );

  for (const document of documents) {
    statement.run(
      document.documentId,
      document.userId,
      document.collection,
      document.fileName,
      document.sourceHash,
      document.indexFingerprint,
      document.chunkCount,
      now(),
    );
  }
}
