import type { Tensor } from "@huggingface/transformers";

import type { DocumentChunk } from "@/types/chunk-type";
import {
  DEFAULT_RERANKING_CONFIGURATION,
  type CrossEncoder,
  type RerankingConfiguration,
  type RetrievalConfiguration,
} from "@/types/retrieval-types";
import type { Ollama } from "ollama";

import type { OllamaEmbedder } from "../embeddings/ollama-embedder";
import type { SearchResult } from "../storage/storage-types";
import type { QdrantStore } from "../storage/vector-storage";
import { DEFAULT_RRF_K, reciprocalRankFusion } from "./fusion";
import { listwiseRerank, pointwiseRerank } from "./llm-reranker";
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
    private readonly client?: Ollama,
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

  /**
   * Runs both retrievers and fuses them by rank. Each leg pulls its own
   * configured candidate count, because the point of hybrid is to let each
   * side contribute chunks the other misses.
   */
  async hybrid(
    question: string,
    limit: number,
    documentIds?: readonly string[],
  ): Promise<SearchResult[]> {
    const [dense, sparse] = await Promise.all([
      this.dense(question, this.retrievalConfig.denseCandidates, documentIds),
      this.sparse(question, this.retrievalConfig.sparseCandidates, documentIds),
    ]);

    return reciprocalRankFusion(
      [dense, sparse],
      this.retrievalConfig.rrfK ?? DEFAULT_RRF_K,
    ).slice(0, limit);
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
        results = await this.hybrid(question, limit, documentIds);
        break;
    }

    if (!this.rerankingConfig.enabled) {
      return results;
    }

    if (this.rerankingConfig.strategy === "lexical") {
      throw new Error("Lexical reranking is not implemented yet.");
    }

    const reranked =
      this.rerankingConfig.strategy === "cross_encoder"
        ? await this.crossEncoderRerank(question, results)
        : await this.llmRerank(question, results);

    return reranked.slice(0, this.retrievalConfig.topK);
  }

  /**
   * Reranks with a generative model rather than a cross-encoder.
   *
   * Pointwise ratings support empirical threshold experiments, but are not
   * calibrated probabilities. Listwise scores encode within-query rank only.
   */
  async llmRerank(
    question: string,
    results: SearchResult[],
  ): Promise<SearchResult[]> {
    if (results.length === 0) return results;

    if (!this.client) {
      throw new Error(
        "LLM reranking requires an Ollama client. Pass one to the Retriever constructor.",
      );
    }

    const passages = results.map((result) => ({
      id: result.chunk.chunkId,
      text: result.chunk.text,
    }));
    const scored =
      this.rerankingConfig.strategy === "llm_listwise"
        ? await listwiseRerank(
            this.client,
            this.rerankingConfig.model,
            question,
            passages,
            this.rerankingConfig.llmPassageWords,
          )
        : await pointwiseRerank(
            this.client,
            this.rerankingConfig.model,
            question,
            passages,
            undefined,
            this.rerankingConfig.llmPassageWords,
          );
    const byId = new Map(scored.map((entry) => [entry.id, entry.score]));

    for (const result of results) {
      const score = byId.get(result.chunk.chunkId) ?? 0;
      result.rerankerScore = score;
      result.score = score;
    }

    return [...results].sort((left, right) => right.score - left.score);
  }
}
