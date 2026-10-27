import {
  countRunWords,
  flattenProseTable,
  minimumPassageWords,
  NOT_INDEXED_BLOCK_TYPES,
  wordCount,
} from "./chunk-helper";
import {
  ChunkConfiguration,
  ExtractedBlock,
  ExtractedPage,
  PassageFamily,
  PassagePiece,
  PassageRun,
} from "@/types/chunk-type";

/**
 * Group indexable blocks into runs of one family under one section, in reading
 * order. A run shorter than the minimum absorbs the next heading or block even
 * across a section or family change, so short sections do not become fragments.
 */
export function groupBlocksIntoRuns(
  pages: readonly ExtractedPage[],
  config: ChunkConfiguration,
): PassageRun[] {
  const runs: PassageRun[] = [];
  const minimum = minimumPassageWords(config);
  const flow = (config.assembly ?? "flow") === "flow";
  let closed = true;
  for (const page of pages) {
    const blocks = (page.blocks ?? []).map((block) => {
      const prose =
        block.type === "table" ? flattenProseTable(block.text) : undefined;
      return prose
        ? { ...block, type: "paragraph" as const, text: prose }
        : block;
    });
    let pageWordStart = 0;
    for (const [index, block] of blocks.entries()) {
      const start = pageWordStart;
      pageWordStart += wordCount(block.text);
      if (NOT_INDEXED_BLOCK_TYPES.has(block.type) || !/\p{L}/u.test(block.text))
        continue;
      const last = runs.at(-1);
      const samePage = flow || last?.pieces.at(-1)?.page === page.page;
      const small =
        !closed &&
        last !== undefined &&
        samePage &&
        countRunWords(last) < minimum;
      if (block.type === "heading") {
        if (small) {
          last.pieces.push({
            text: block.text,
            page: block.page,
            wordStart: start,
            words: wordCount(block.text),
            family: "prose",
          });
        } else closed = true;
        continue;
      }
      const family: PassageFamily =
        block.type === "table" ||
        (block.type === "caption" && blocks[index + 1]?.type === "table")
          ? "table"
          : block.type === "reference"
            ? "reference"
            : "prose";
      const pieces = splitBlockIntoPieces(block, family, start, config);
      if (
        last !== undefined &&
        (small ||
          (!closed &&
            samePage &&
            last.family === family &&
            last.section === block.section))
      ) {
        last.pieces.push(...pieces);
      } else {
        runs.push({ family, section: block.section, pieces });
      }
      closed = false;
    }
  }
  return runs.filter((run) => run.pieces.length > 0);
}

/** Pack pieces into chunks of at most wordSize words, carrying whole trailing pieces as overlap. */
export function packPieces(
  pieces: PassagePiece[],
  wordSize: number,
  overlapWords: number,
  minimum: number,
): PassagePiece[][] {
  const groups: PassagePiece[][] = [];
  let current: PassagePiece[] = [];
  let words = 0;
  for (const piece of pieces) {
    if (current.length && words + piece.words > wordSize) {
      groups.push(current);
      const carry: PassagePiece[] = [];
      let carried = 0;
      for (let index = current.length - 1; index >= 0; index -= 1) {
        if (carried + current[index].words > overlapWords) break;
        carry.unshift(current[index]);
        carried += current[index].words;
      }
      // Never let overlap alone fill the next chunk.
      if (carried + piece.words > wordSize) {
        carry.length = 0;
        carried = 0;
      }
      current = carry;
      words = carried;
    }
    current.push(piece);
    words += piece.words;
  }
  if (current.length) groups.push(current);

  // Fold a short final tail into the previous chunk instead of emitting a fragment.
  const previous = groups.at(-2);
  const tail = groups.at(-1);
  if (previous && tail) {
    const fresh = tail.filter((piece) => !previous.includes(piece));
    const freshWords = fresh.reduce((sum, piece) => sum + piece.words, 0);
    const previousWords = previous.reduce((sum, piece) => sum + piece.words, 0);
    if (
      freshWords < minimum &&
      previousWords + freshWords <= wordSize + minimum
    ) {
      groups.pop();
      previous.push(...fresh);
    }
  }
  return groups;
}

/**
 * Cut one block into pieces: table row groups, a whole caption, or sentences.
 * A sentence longer than wordSize falls back to bounded word windows.
 */
function splitBlockIntoPieces(
  block: ExtractedBlock,
  family: PassageFamily,
  wordStart: number,
  config: ChunkConfiguration,
): PassagePiece[] {
  const pieces: PassagePiece[] = [];
  let offset = wordStart;
  const parts =
    block.type === "table"
      ? splitTable(block.text, config.wordSize)
      : block.type === "caption"
        ? [block.text]
        : block.text.split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}"“(])/u);
  for (const part of parts) {
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
          page: block.page,
          wordStart: offset + start,
          words: window.length,
          family,
        });
        if (start + config.wordSize >= words.length) break;
      }
    }
    if (block.type !== "table") offset += words.length;
  }
  return pieces;
}

/** Split a table into row groups of at most wordSize words, repeating the header row in each group. */
function splitTable(text: string, wordSize: number): string[] {
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
