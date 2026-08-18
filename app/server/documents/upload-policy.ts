export const ACCEPTED_EXTENSIONS = [
  "pdf",
  "csv",
  "docx",
  "txt",
  "xlsx",
  "md",
] as const;

export type AcceptedExtension = (typeof ACCEPTED_EXTENSIONS)[number];

export const MAX_DOCUMENT_COUNT = 10;
export const MAX_DOCUMENT_SIZE_MB = 25;
export const MAX_DOCUMENT_SIZE_BYTES = MAX_DOCUMENT_SIZE_MB * 1024 * 1024;

export const DOCUMENT_INPUT_ACCEPT = ACCEPTED_EXTENSIONS.map(
  (extension) => `.${extension}`,
).join(",");

export const DOCUMENT_TYPE_LABEL = ACCEPTED_EXTENSIONS.map(
  (extension) => extension.toUpperCase(),
).join(", ");

export const RAG_ACCEPTED_EXTENSIONS = ["pdf", "txt", "md"] as const;

export const RAG_DOCUMENT_INPUT_ACCEPT = RAG_ACCEPTED_EXTENSIONS.map(
  (extension) => `.${extension}`,
).join(",");

export const RAG_DOCUMENT_TYPE_LABEL = RAG_ACCEPTED_EXTENSIONS.map(
  (extension) => extension.toUpperCase(),
).join(", ");

type DocumentCandidate = {
  name: string;
  size: number;
};

export function extensionOf(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function isAcceptedExtension(
  extension: string,
): extension is AcceptedExtension {
  return (ACCEPTED_EXTENSIONS as readonly string[]).includes(extension);
}

export function validateDocumentSelection(
  documents: readonly DocumentCandidate[],
): string | null {
  if (documents.length === 0) {
    return "Select at least one document.";
  }

  if (documents.length > MAX_DOCUMENT_COUNT) {
    return `Select no more than ${MAX_DOCUMENT_COUNT} documents at once.`;
  }

  for (const document of documents) {
    if (!isAcceptedExtension(extensionOf(document.name))) {
      return `${document.name} is not a supported document type.`;
    }

    if (document.size === 0) {
      return `${document.name} is empty.`;
    }

    if (document.size > MAX_DOCUMENT_SIZE_BYTES) {
      return `${document.name} exceeds the ${MAX_DOCUMENT_SIZE_MB} MB file limit.`;
    }
  }

  return null;
}

export function validateRagDocumentSelection(
  documents: readonly DocumentCandidate[],
): string | null {
  const validationError = validateDocumentSelection(documents);

  if (validationError) {
    return validationError;
  }

  for (const document of documents) {
    const extension = extensionOf(document.name);

    if (!(RAG_ACCEPTED_EXTENSIONS as readonly string[]).includes(extension)) {
      return `${document.name} is accepted for upload, but is not implemented in the RAG chunker yet.`;
    }
  }

  return null;
}
