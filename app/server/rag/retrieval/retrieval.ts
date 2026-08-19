import { QdrantStore } from "../storage/vector-storage";
import { OllamaEmbedder } from "../embeddings/ollama-embedder";
import { RetrievalConfiguration } from "@/types/retrieval-types";
import { DocumentChunk } from "@/types/chunk-type";
import { SearchResult } from "../storage/storage-types";


export class Retriever {
  private chunks: DocumentChunk[] | null = null;

  constructor(
    private readonly store: QdrantStore,
    private readonly embedder: OllamaEmbedder,
    private readonly retrievalConfig: RetrievalConfiguration,
    //private readonly rerankingConfig: RerankingConfiguration,
  ) {}

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
    switch (this.retrievalConfig.strategy) {
      case "dense":
        return this.dense(question, this.retrievalConfig.topK, documentIds);
      case "sparse":
        return this.sparse(question, this.retrievalConfig.topK, documentIds);
      case "hybrid":
        throw new Error("Hybrid retrieval is not implemented yet.");
    }
  }
}
