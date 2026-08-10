import type { DocumentUploadResponse } from "@/types/document-upload";

import { POST } from "./route";

export function documentRequest(documents: readonly File[] = []) {
  const formData = new FormData();

  for (const document of documents) {
    formData.append("documents", document);
  }

  return new Request("http://localhost/api/documents", {
    method: "POST",
    body: formData,
  });
}

export async function submitDocuments(documents: readonly File[] = []) {
  const response = await POST(documentRequest(documents));
  const body = (await response.json()) as DocumentUploadResponse;

  return { body, response };
}

export function validDocument(
  name = "document.pdf",
  content: BlobPart = "document content",
  type = "application/pdf",
) {
  return new File([content], name, { type });
}
