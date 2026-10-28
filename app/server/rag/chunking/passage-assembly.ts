import {
  countRunWords,
  minimumPassageWords,
  sumPieceWords,
} from "./chunk-helper";
import {
  blockFamily,
  blockWordStarts,
  flattenProseTableBlocks,
  foldShortTail,
  headingPiece,
  isIndexable,
  overlapCarry,
  splitBlockIntoPieces,
} from "./passage-assembly-helper";
import {
  ChunkConfiguration,
  ExtractedPage,
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
    const blocks = flattenProseTableBlocks(page.blocks ?? []);
    const wordStarts = blockWordStarts(blocks);
    for (const [index, block] of blocks.entries()) {
      if (!isIndexable(block)) continue;
      const start = wordStarts[index];
      const last = runs.at(-1);
      const samePage = flow || last?.pieces.at(-1)?.page === page.page;
      const open = !closed && last !== undefined && samePage;
      const small = open && countRunWords(last) < minimum;
      if (block.type === "heading") {
        if (small) last.pieces.push(headingPiece(block, start));
        else closed = true;
        continue;
      }
      const family = blockFamily(block, blocks[index + 1]);
      const pieces = splitBlockIntoPieces(block, family, start, config);
      if (
        small ||
        (open && last.family === family && last.section === block.section)
      ) {
        last.pieces.push(...pieces);
      } else {
        runs.push({ family, section: block.section, pieces });
      }
      closed = false;
    }
  }
  return runs;
}

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
      current = overlapCarry(current, piece, wordSize, overlapWords);
      words = sumPieceWords(current);
    }
    current.push(piece);
    words += piece.words;
  }
  if (current.length) groups.push(current);
  foldShortTail(groups, wordSize, minimum);
  return groups;
}
