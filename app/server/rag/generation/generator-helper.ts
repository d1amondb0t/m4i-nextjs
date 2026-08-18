const TOKEN_PATTERN = /[A-Za-z0-9]+/g;

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(TOKEN_PATTERN) ?? [];
}

export function intersectionSize(left: Set<string>, right: Set<string>): number {
  let size = 0;

  for (const term of left) {
    if (right.has(term)) {
      size++;
    }
  }

  return size;
};

export function splitWords(text: string): string[] {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

