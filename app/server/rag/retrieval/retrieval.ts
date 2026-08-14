import { QdrantStore } from "../storage/vector-storage";
import { OllamaEmbedder } from "../embeddings/ollama-embedder";
import { RerankingConfiguration, RetrievalConfiguration } from "./retrieval-types";
import { DocumentChunk } from "../chunking/chunk-type";
import { SearchResult } from "../storage/storage-types";


export class Retriever {
  private chunks: DocumentChunk[] | null = null;

  constructor(
    private readonly store: QdrantStore,
    private readonly embedder: OllamaEmbedder,
    private readonly retrievalConfig: RetrievalConfiguration,
    //private readonly rerankingConfig: RerankingConfiguration,
  ) {}

  async dense(question: string, limit: number): Promise<SearchResult[]> {
    const queryVector = await this.embedder.embedQuery(question);
    return this.store.denseSearch(queryVector, limit);
  }

  async sparse(question: string, limit: number): Promise<SearchResult[]> {
    return this.store.sparseSearch(question, limit);
  }

  async hybrid(question: string) {}
}