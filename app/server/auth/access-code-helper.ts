import { createHash, randomInt } from "node:crypto";

// No 0/O, 1/I/L, so codes survive being read aloud or retyped.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_GROUPS = 3;
const CODE_GROUP_LENGTH = 4;

export function generateAccessCode(): string {
  return Array.from({ length: CODE_GROUPS }, () =>
    Array.from(
      { length: CODE_GROUP_LENGTH },
      () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
    ).join(""),
  ).join("-");
}

export function normalizeAccessCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashAccessCode(code: string): string {
  return createHash("sha256").update(normalizeAccessCode(code)).digest("hex");
}

export function collectionForUser(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!slug) {
    throw new Error("A user name needs at least one letter or digit.");
  }

  return `m4i_${slug}`;
}
