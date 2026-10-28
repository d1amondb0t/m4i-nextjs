import { DocumentChunk } from "@/types/chunk-type";

const TOKEN_PATTERN = /[A-Za-z0-9]+/g;

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(TOKEN_PATTERN) ?? [];
}

export function intersectionSize(
  left: Set<string>,
  right: Set<string>,
): number {
  let size = 0;

  for (const term of left) {
    if (right.has(term)) {
      size++;
    }
  }

  return size;
}

export function splitWords(text: string): string[] {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

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
