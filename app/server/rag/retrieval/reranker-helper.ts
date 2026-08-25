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
