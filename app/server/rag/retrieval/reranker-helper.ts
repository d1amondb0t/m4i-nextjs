import type { CrossEncoder, RerankingConfiguration } from "@/types/retrieval-types";

async function load(
  rerankingConfig: RerankingConfiguration,
  localFilesOnly: boolean,
): Promise<CrossEncoder> {
  const { AutoModelForSequenceClassification, AutoTokenizer } = await import(
    "@huggingface/transformers");
    
  const options = { local_files_only: localFilesOnly };
  const [model, tokenizer] = await Promise.all([
    AutoModelForSequenceClassification.from_pretrained(
      rerankingConfig.model,
      options),
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

/**
 * Scores query/passage pairs with a loaded cross-encoder, sigmoid-normalised
 * into (0, 1).
 *
 * Split out from `Retriever` so a cached candidate pool can be rescored by a
 * different cross-encoder without touching storage or embeddings — which is
 * what makes comparing rerankers cheap.
 */
export async function crossEncoderScores(
  encoder: CrossEncoder,
  question: string,
  texts: readonly string[],
): Promise<number[]> {
  if (texts.length === 0) return [];

  const { model, tokenizer } = encoder;
  const features = tokenizer(
    texts.map(() => question),
    { text_pair: [...texts], padding: true, truncation: true },
  );
  const { logits } = (await model(features)) as {
    logits: { data: ArrayLike<number> };
  };
  const scores = Array.from(logits.data, (score) => Number(score));

  if (scores.length !== texts.length) {
    throw new Error(
      `Cross-encoder returned ${scores.length} scores for ${texts.length} passages.`,
    );
  }

  return scores.map((score) => 1 / (1 + Math.exp(-score)));
}
