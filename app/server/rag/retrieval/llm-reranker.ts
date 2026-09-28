import type { Ollama } from "ollama";

/**
 * LLM rerankers, in the two shapes the literature uses.
 *
 * `listwise` follows RankGPT: the model sees the candidates together and emits
 * a permutation. It ranks well but returns only an order, so the score it
 * yields is a within-question rank and carries no absolute meaning — usable
 * for adaptive k, useless for a global accept threshold.
 *
 * `pointwise` asks for an independent 0-10 rating per passage. It ranks a
 * little worse but produces a genuine absolute score, which is what threshold
 * calibration needs. This is the "LLM nonconformity score" used in the
 * conformal context-filtering literature.
 *
 * Both take a minimal passage shape rather than a SearchResult, so they can
 * rescore a cached pool without reconstructing storage types.
 */

export type Passage = {
  id: string;
  text: string;
};

export type ScoredPassage = {
  id: string;
  score: number;
};

const RANKING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ranking"],
  properties: {
    ranking: { type: "array", items: { type: "number" } },
  },
} as const;

const RATING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ratings"],
  properties: {
    ratings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["passage", "relevance"],
        properties: {
          passage: { type: "number" },
          relevance: { type: "number" },
        },
      },
    },
  },
} as const;

const RELEVANCE_RUBRIC = [
  "Relevance means the passage contains specific information that helps answer the",
  "question: a reported outcome, an indicator or measure, a quantity, a target, a",
  "commitment, or a finding on the question's subject.",
  "",
  "Passages that merely mention the topic, or that are tables of contents, heading",
  "lists, reference lists, acknowledgements, disclaimers or page furniture, are not",
  "relevant however well their wording matches.",
].join("\n");

const LISTWISE_SYSTEM = [
  "You rank passages by how well they answer an analyst's question.",
  "",
  RELEVANCE_RUBRIC,
  "",
  "Return every passage number exactly once, most relevant first.",
].join("\n");

const POINTWISE_SYSTEM = [
  "You rate how well each passage answers an analyst's question.",
  "",
  RELEVANCE_RUBRIC,
  "",
  "Rate each passage from 0 (no relevant information) to 10 (directly and",
  "specifically answers the question). Rate every passage independently.",
].join("\n");

/**
 * Words of each passage shown to the model. Listwise reranking puts every
 * candidate in one prompt, so full 800-word chunks blow past a usable context
 * and the model starts truncating its own output mid-array. The listwise
 * literature truncates passages for the same reason.
 */
export const LLM_PASSAGE_WORDS = 220;

function truncate(text: string, words: number): string {
  const parts = text.trim().split(/\s+/);

  return parts.length <= words ? text.trim() : `${parts.slice(0, words).join(" ")} ...`;
}

function listing(passages: readonly Passage[], words: number): string {
  return passages
    .map((passage, index) => `[${index + 1}] ${truncate(passage.text, words)}`)
    .join("\n\n");
}

/**
 * Structured output still occasionally comes back truncated or malformed, and
 * a reranker that throws is worse than one that degrades. Falls back to
 * scraping integers out of the raw response, then to an empty result, which
 * callers treat as "keep the existing order".
 */
export function parseLoosely<T>(content: string, key: "ranking" | "ratings"): T | null {
  try {
    return JSON.parse(content) as T;
  } catch {
    // fall through to salvage
  }

  if (key === "ranking") {
    const numbers = [...content.matchAll(/\d+/g)].map((match) => Number(match[0]));

    return numbers.length > 0 ? ({ ranking: numbers } as T) : null;
  }

  const ratings = [
    ...content.matchAll(/"passage"\s*:\s*(\d+)\s*,\s*"relevance"\s*:\s*(\d+(?:\.\d+)?)/g),
  ].map((match) => ({ passage: Number(match[1]), relevance: Number(match[2]) }));

  return ratings.length > 0 ? ({ ratings } as T) : null;
}

/**
 * Turns a model permutation into ranks. Out-of-range and duplicate entries are
 * dropped, and anything omitted keeps its original relative order behind the
 * ranked items, so a partial response degrades rather than fails.
 */
export function ranksFromPermutation(
  permutation: readonly number[],
  count: number,
): number[] {
  const ranks = new Array<number>(count).fill(Number.NaN);
  const seen = new Set<number>();
  let next = 0;

  for (const entry of permutation) {
    const index = entry - 1;

    if (!Number.isInteger(index) || index < 0 || index >= count || seen.has(index)) {
      continue;
    }

    seen.add(index);
    ranks[index] = next;
    next += 1;
  }

  for (let index = 0; index < count; index += 1) {
    if (Number.isNaN(ranks[index])) {
      ranks[index] = next;
      next += 1;
    }
  }

  return ranks;
}

export async function listwiseRerank(
  client: Ollama,
  model: string,
  question: string,
  passages: readonly Passage[],
  words: number = LLM_PASSAGE_WORDS,
): Promise<ScoredPassage[]> {
  if (passages.length === 0) return [];

  const response = await client.chat({
    model,
    think: false,
    format: RANKING_SCHEMA,
    messages: [
      { role: "system", content: LISTWISE_SYSTEM },
      {
        role: "user",
        content: `Question: ${question}\n\n${listing(passages, words)}\n\nRank all ${passages.length} passages.`,
      },
    ],
    options: { temperature: 0 },
  });
  const parsed = parseLoosely<{ ranking?: number[] }>(response.message.content, "ranking");
  const ranks = ranksFromPermutation(parsed?.ranking ?? [], passages.length);

  return passages
    .map((passage, index) => ({
      id: passage.id,
      score: (passages.length - ranks[index]) / passages.length,
    }))
    .sort((left, right) => right.score - left.score);
}

export async function pointwiseRerank(
  client: Ollama,
  model: string,
  question: string,
  passages: readonly Passage[],
  batchSize = 8,
  words: number = LLM_PASSAGE_WORDS,
): Promise<ScoredPassage[]> {
  if (passages.length === 0) return [];

  const scored: ScoredPassage[] = [];

  for (let start = 0; start < passages.length; start += batchSize) {
    const batch = passages.slice(start, start + batchSize);
    const response = await client.chat({
      model,
      think: false,
      format: RATING_SCHEMA,
      messages: [
        { role: "system", content: POINTWISE_SYSTEM },
        {
          role: "user",
          content: `Question: ${question}\n\n${listing(batch, words)}\n\nRate all ${batch.length} passages.`,
        },
      ],
      options: { temperature: 0 },
    });
    const parsed = parseLoosely<{ ratings?: { passage: number; relevance: number }[] }>(
      response.message.content,
      "ratings",
    );
    const byPassage = new Map(
      (parsed?.ratings ?? []).map((rating) => [rating.passage, rating.relevance]),
    );

    for (const [index, passage] of batch.entries()) {
      const raw = byPassage.get(index + 1);
      const bounded =
        typeof raw === "number" && Number.isFinite(raw)
          ? Math.min(Math.max(raw, 0), 10)
          : 0;

      scored.push({ id: passage.id, score: bounded / 10 });
    }
  }

  return [...scored].sort((left, right) => right.score - left.score);
}
