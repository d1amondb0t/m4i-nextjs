import {
  flattenProseTable,
  NOT_INDEXED_BLOCK_TYPES,
  sumPieceWords,
  wordCount,
} from "./chunk-helper";
import {
  ChunkConfiguration,
  ExtractedBlock,
  PassageFamily,
  PassagePiece,
} from "@/types/chunk-type";

const SENTENCE_BOUNDARY = /(?<=[.!?])\s+(?=[\p{Lu}\p{N}"“(])/u;

export function flattenProseTableBlocks(
  blocks: readonly ExtractedBlock[],
): ExtractedBlock[] {
  return blocks.map((block) => {
    const prose =
      block.type === "table" ? flattenProseTable(block.text) : undefined;
    return prose
      ? { ...block, type: "paragraph" as const, text: prose }
      : block;
  });
}

export function blockWordStarts(blocks: readonly ExtractedBlock[]): number[] {
  let total = 0;
  return blocks.map((block) => {
    const start = total;
    total += wordCount(block.text);
    return start;
  });
}

export function isIndexable(block: ExtractedBlock): boolean {
  return !NOT_INDEXED_BLOCK_TYPES.has(block.type) && /\p{L}/u.test(block.text);
}

export function headingPiece(
  block: ExtractedBlock,
  wordStart: number,
): PassagePiece {
  return {
    text: block.text,
    page: block.page,
    wordStart,
    words: wordCount(block.text),
    family: "prose",
  };
}

export function blockFamily(
  block: ExtractedBlock,
  next: ExtractedBlock | undefined,
): PassageFamily {
  if (block.type === "table") return "table";
  if (block.type === "caption" && next?.type === "table") return "table";
  if (block.type === "reference") return "reference";
  return "prose";
}

function splitTableIntoRowGroups(text: string, wordSize: number): string[] {
  const [header, ...rows] = text.split("\n");
  const groups: string[] = [];
  let current = [header];
  for (const row of rows) {
    if (
      wordCount([...current, row].join(" ")) > wordSize &&
      current.length > 1
    ) {
      groups.push(current.join("\n"));
      current = [header];
    }
    current.push(row);
  }
  groups.push(current.join("\n"));
  return groups;
}

function splitBlockText(block: ExtractedBlock, wordSize: number): string[] {
  if (block.type === "table")
    return splitTableIntoRowGroups(block.text, wordSize);
  if (block.type === "caption") return [block.text];
  return block.text.split(SENTENCE_BOUNDARY);
}

function wordWindowPieces(
  words: readonly string[],
  page: number,
  wordStart: number,
  family: PassageFamily,
  config: ChunkConfiguration,
): PassagePiece[] {
  const pieces: PassagePiece[] = [];
  const overlap = Math.min(
    config.overlapWords,
    Math.floor(config.wordSize / 4),
  );
  for (
    let start = 0;
    start < words.length;
    start += config.wordSize - overlap
  ) {
    const window = words.slice(start, start + config.wordSize);
    pieces.push({
      text: window.join(" "),
      page,
      wordStart: wordStart + start,
      words: window.length,
      family,
    });
    if (start + config.wordSize >= words.length) break;
  }
  return pieces;
}

export function splitBlockIntoPieces(
  block: ExtractedBlock,
  family: PassageFamily,
  wordStart: number,
  config: ChunkConfiguration,
): PassagePiece[] {
  const pieces: PassagePiece[] = [];
  let offset = wordStart;
  for (const part of splitBlockText(block, config.wordSize)) {
    const words = part.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    if (block.type === "table" || words.length <= config.wordSize) {
      pieces.push({
        text: part,
        page: block.page,
        wordStart: offset,
        words: words.length,
        family,
      });
    } else {
      pieces.push(
        ...wordWindowPieces(words, block.page, offset, family, config),
      );
    }
    if (block.type !== "table") offset += words.length;
  }
  return pieces;
}

function trailingPieces(
  pieces: readonly PassagePiece[],
  maxWords: number,
): PassagePiece[] {
  const trailing: PassagePiece[] = [];
  let words = 0;
  for (let index = pieces.length - 1; index >= 0; index -= 1) {
    if (words + pieces[index].words > maxWords) break;
    trailing.unshift(pieces[index]);
    words += pieces[index].words;
  }
  return trailing;
}

export function overlapCarry(
  previous: readonly PassagePiece[],
  next: PassagePiece,
  wordSize: number,
  overlapWords: number,
): PassagePiece[] {
  const carry = trailingPieces(previous, overlapWords);
  return sumPieceWords(carry) + next.words > wordSize ? [] : carry;
}

export function foldShortTail(
  groups: PassagePiece[][],
  wordSize: number,
  minimum: number,
): void {
  const [previous, tail] = groups.slice(-2);
  if (!tail) return;
  const fresh = tail.filter((piece) => !previous.includes(piece));
  const freshWords = sumPieceWords(fresh);
  if (
    freshWords < minimum &&
    sumPieceWords(previous) + freshWords <= wordSize + minimum
  ) {
    groups.pop();
    previous.push(...fresh);
  }
}
