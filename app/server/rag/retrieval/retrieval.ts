import type { Tensor } from "@huggingface/transformers";
import { Ollama } from "ollama";

import type { DocumentChunk } from "@/types/chunk-type";
import {
  DEFAULT_RERANKING_CONFIGURATION,
  type CrossEncoder,
  type RerankingComparison,
  type RerankingConfiguration,
  type RetrievalConfiguration,
  type RetrievalScope,
} from "@/types/retrieval-types";
import type { OllamaEmbedder } from "../embeddings/ollama-embedder";
import type { SearchResult } from "../storage/storage-types";
import type { QdrantStore } from "../storage/vector-storage";
import {
  loadCrossEncoder,
  ollamaRerankerScore,
  rerankingComparison,
  sortByRerankerScore,
} from "./reranker-helper";

export class Retriever {
  private chunks: DocumentChunk[] | null = null;
  private crossEncoder: Promise<CrossEncoder> | null = null;

  constructor(
    private readonly store: QdrantStore,
    private readonly embedder: OllamaEmbedder,
    private readonly retrievalConfig: RetrievalConfiguration,
    private readonly rerankingConfig: RerankingConfiguration = DEFAULT_RERANKING_CONFIGURATION,
    private readonly ollama: Ollama = new Ollama(),
  ) {}

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

  async crossEncoderRerank(
    question: string,
    results: SearchResult[],
  ): Promise<SearchResult[]> {
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
    const scores = Array.from(
      logits.data,
      (score) => 1 / (1 + Math.exp(-Number(score))),
    );

    if (scores.length !== results.length) {
      throw new Error(
        `Cross-encoder returned ${scores.length} scores for ${results.length} results.`,
      );
    }

    return sortByRerankerScore(results, scores);
  }

  async ollamaRerank(
    question: string,
    results: SearchResult[],
  ): Promise<SearchResult[]> {
    const scores = await Promise.all(
      results.map((result) =>
        ollamaRerankerScore(
          this.ollama,
          this.rerankingConfig.model,
          question,
          result.chunk.text,
        ),
      ),
    );

    return sortByRerankerScore(results, scores);
  }

  async dense(
    question: string,
    limit: number,
    scope?: RetrievalScope,
  ): Promise<SearchResult[]> {
    const queryVector = await this.embedder.embedQuery(question);
    return scope === undefined
      ? this.store.denseSearch(queryVector, limit)
      : this.store.denseSearch(queryVector, limit, scope);
  }

  async sparse(
    question: string,
    limit: number,
    scope?: RetrievalScope,
  ): Promise<SearchResult[]> {
    return scope === undefined
      ? this.store.sparseSearch(question, limit)
      : this.store.sparseSearch(question, limit, scope);
  }

  async hybrid(
    question: string,
    limit: number,
    scope?: RetrievalScope,
  ): Promise<SearchResult[]> {
    const queryVector = await this.embedder.embedQuery(question);
    const candidates = {
      dense: Math.max(limit, this.retrievalConfig.denseCandidates),
      sparse: Math.max(limit, this.retrievalConfig.sparseCandidates),
    };
    return scope === undefined
      ? this.store.hybridSearch(queryVector, question, limit, candidates)
      : this.store.hybridSearch(
          queryVector,
          question,
          limit,
          candidates,
          scope,
        );
  }

  private async candidates(
    question: string,
    scope?: RetrievalScope,
  ): Promise<SearchResult[]> {
    const limit = this.rerankingConfig.enabled
      ? this.rerankingConfig.candidates
      : this.retrievalConfig.topK;

    switch (this.retrievalConfig.strategy) {
      case "dense":
        return this.dense(question, limit, scope);
      case "sparse":
        return this.sparse(question, limit, scope);
      case "hybrid":
        return this.hybrid(question, limit, scope);
    }
  }

  private async rerank(
    question: string,
    candidates: SearchResult[],
  ): Promise<SearchResult[]> {
    if (this.rerankingConfig.strategy !== "cross_encoder") {
      throw new Error("Lexical reranking is not implemented yet.");
    }

    return this.rerankingConfig.runtime === "ollama"
      ? this.ollamaRerank(question, candidates)
      : this.crossEncoderRerank(question, candidates);
  }

  async retrieve(
    question: string,
    scope?: RetrievalScope,
  ): Promise<SearchResult[]> {
    const candidates = await this.candidates(question, scope);

    if (!this.rerankingConfig.enabled) {
      return candidates;
    }

    const reranked = await this.rerank(question, candidates);
    return reranked.slice(0, this.retrievalConfig.topK);
  }

  async retrieveWithComparison(
    question: string,
    scope?: RetrievalScope,
  ): Promise<RerankingComparison> {
    const candidates = await this.candidates(question, scope);
    const reranked = await this.rerank(question, candidates);

    return rerankingComparison(candidates, reranked, this.retrievalConfig.topK);
  }
}
