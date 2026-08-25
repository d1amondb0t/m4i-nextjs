import type { Tensor } from "@huggingface/transformers";

import type { DocumentChunk } from "@/types/chunk-type";
import {
  DEFAULT_RERANKING_CONFIGURATION,
  type CrossEncoder,
  type RerankingConfiguration,
  type RetrievalConfiguration,
} from "@/types/retrieval-types";
import type { OllamaEmbedder } from "../embeddings/ollama-embedder";
import type { SearchResult } from "../storage/storage-types";
import type { QdrantStore } from "../storage/vector-storage";
import { loadCrossEncoder } from "./reranker-helper";

export class Retriever {
  private chunks: DocumentChunk[] | null = null;
  private crossEncoder: Promise<CrossEncoder> | null = null;

  constructor(
    private readonly store: QdrantStore,
    private readonly embedder: OllamaEmbedder,
    private readonly retrievalConfig: RetrievalConfiguration,
    private readonly rerankingConfig: RerankingConfiguration =
      DEFAULT_RERANKING_CONFIGURATION,
  ) { }

  private async getCrossEncoder(): Promise<CrossEncoder> {
    if (this.crossEncoder === null) {
      this.crossEncoder = loadCrossEncoder(this.rerankingConfig);
    }

    try {
      return await this.crossEncoder;
    } catch (error) {
      this.crossEncoder = null;
      throw error;
    }
  }

  async crossEncoderRerank(question: string, results: SearchResult[]):
    Promise<SearchResult[]> {
    if (results.length === 0) {
      return results;
    }

    const { model, tokenizer } = await this.getCrossEncoder();
    const features = tokenizer(
      results.map(() => question),
      {
        text_pair: results.map((result) => result.chunk.text),
        padding: true,
        truncation: true,
      },
    );
    const { logits } = (await model(features)) as { logits: Tensor };
    const scores = Array.from(logits.data, (score) => Number(score));

    if (scores.length !== results.length) {
      throw new Error(`Cross-encoder returned ${scores.length} scores for ${results.length} results.`);
    }

    for (let index = 0; index < results.length; index += 1) {
      const score = scores[index];
      //results[index].rerankerScore = score;
      //results[index].score = score;
      results[index].rerankerScore = 1 / (1 + Math.exp(-score));
      results[index].score = 1 / (1 + Math.exp(-score));
    }

    return [...results].sort((left, right) => right.score - left.score);
  }

  async dense(
    question: string,
    limit: number,
    documentIds?: readonly string[],
  ): Promise<SearchResult[]> {
    const queryVector = await this.embedder.embedQuery(question);
    return documentIds === undefined
      ? this.store.denseSearch(queryVector, limit)
      : this.store.denseSearch(queryVector, limit, documentIds);
  }

  async sparse(
    question: string,
    limit: number,
    documentIds?: readonly string[],
  ): Promise<SearchResult[]> {
    return documentIds === undefined
      ? this.store.sparseSearch(question, limit)
      : this.store.sparseSearch(question, limit, documentIds);
  }

  async retrieve(
    question: string,
    documentIds?: readonly string[],
  ): Promise<SearchResult[]> {
    const limit = this.rerankingConfig.enabled
      ? this.rerankingConfig.candidates
      : this.retrievalConfig.topK;
    let results: SearchResult[];

    switch (this.retrievalConfig.strategy) {
      case "dense":
        results = await this.dense(question, limit, documentIds);
        break;
      case "sparse":
        results = await this.sparse(question, limit, documentIds);
        break;
      case "hybrid":
        throw new Error("Hybrid retrieval is not implemented yet.");
    }

    if (!this.rerankingConfig.enabled) {
      return results;
    }

    if (this.rerankingConfig.strategy !== "cross_encoder") {
      throw new Error("Lexical reranking is not implemented yet.");
    }

    const reranked = await this.crossEncoderRerank(question, results);
    return reranked.slice(0, this.retrievalConfig.topK);
  }
}
