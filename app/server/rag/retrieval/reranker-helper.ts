import type { GenerateResponse, Ollama } from "ollama";

import type {
  CrossEncoder,
  OllamaLogprobs,
  OllamaTokenLogprob,
  RerankingConfiguration,
} from "@/types/retrieval-types";
import type { SearchResult } from "../storage/storage-types";

const ZERANK_TRUE_TOKEN = "Yes";
const ZERANK_FALSE_TOKEN = "No";
const ZERANK_SCORE_SCALE = 5;
// Chunks are at most about 250 words. Ollama's default context is far larger
// and pushes part of the model off the GPU, making reranking slower.
const ZERANK_CONTEXT_TOKENS = 2048;

async function load(
  rerankingConfig: RerankingConfiguration,
  localFilesOnly: boolean,
): Promise<CrossEncoder> {
  const { AutoModelForSequenceClassification, AutoTokenizer } =
    await import("@huggingface/transformers");

  const options = { local_files_only: localFilesOnly };
  const [model, tokenizer] = await Promise.all([
    AutoModelForSequenceClassification.from_pretrained(
      rerankingConfig.model,
      options,
    ),
    AutoTokenizer.from_pretrained(rerankingConfig.model, options),
  ]);

  return { model, tokenizer };
}

export async function loadCrossEncoder(
  rerankingConfig: RerankingConfiguration,
): Promise<CrossEncoder> {
  try {
    return await load(rerankingConfig, true);
  } catch {
    return load(rerankingConfig, false);
  }
}

export function zerankPrompt(question: string, passage: string): string {
  return (
    `<|im_start|>system\n${question}<|im_end|>\n` +
    `<|im_start|>user\n${passage}<|im_end|>\n` +
    "<|im_start|>assistant\n"
  );
}

function logprobOf(
  topLogprobs: readonly OllamaTokenLogprob[],
  token: string,
): number | undefined {
  return topLogprobs.find((item) => item.token === token)?.logprob;
}

function scoreHeadBaseline(topLogprobs: readonly OllamaTokenLogprob[]): number {
  const others = topLogprobs.filter(
    (item) =>
      item.token !== ZERANK_TRUE_TOKEN && item.token !== ZERANK_FALSE_TOKEN,
  );

  if (
    others.length < 2 ||
    Math.abs(others[0].logprob - others[1].logprob) > 1e-6
  ) {
    throw new Error(
      "The reranking model is not a zerank-2 score-head model; build one with scripts/build_zerank_ollama.py.",
    );
  }

  return others[0].logprob;
}

export function zerankLogit(
  topLogprobs: readonly OllamaTokenLogprob[],
): number {
  const baseline = scoreHeadBaseline(topLogprobs);
  const yes = logprobOf(topLogprobs, ZERANK_TRUE_TOKEN);
  const no = logprobOf(topLogprobs, ZERANK_FALSE_TOKEN);

  if (yes !== undefined) return yes - baseline;
  if (no !== undefined) return baseline - no;
  return 0;
}

export async function ollamaRerankerScore(
  client: Ollama,
  model: string,
  question: string,
  passage: string,
): Promise<number> {
  const request = {
    model,
    prompt: zerankPrompt(question, passage),
    raw: true,
    stream: false as const,
    logprobs: true,
    top_logprobs: 20,
    options: {
      num_ctx: ZERANK_CONTEXT_TOKENS,
      num_predict: 1,
      temperature: 0,
      repeat_penalty: 1,
    },
  };
  const response = (await client.generate(request)) as GenerateResponse &
    OllamaLogprobs;
  const topLogprobs = response.logprobs?.[0]?.top_logprobs;

  if (!topLogprobs) {
    throw new Error(`${model} returned no token log-probabilities.`);
  }

  return 1 / (1 + Math.exp(-zerankLogit(topLogprobs) / ZERANK_SCORE_SCALE));
}

export function sortByRerankerScore(
  results: SearchResult[],
  scores: readonly number[],
): SearchResult[] {
  results.forEach((result, index) => {
    result.rerankerScore = scores[index];
    result.score = scores[index];
  });

  return [...results].sort((left, right) => right.score - left.score);
}
