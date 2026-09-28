/**
 * The experiment grid.
 *
 * Axes are separated so the expensive ones run once: chunking decides how the
 * corpus is cut (4 variants, each parsed once), embedding decides how it is
 * vectorised (4 variants, so 16 Qdrant collections), and retrieval strategy is
 * free at query time. Reranking and selection reorder cached pools and need no
 * index at all.
 *
 * HyDE is deliberately absent. The one published benchmark that measured it on
 * this kind of workload found it the worst of ten strategies, because
 * hallucinated specifics inject noise into the query vector.
 */
import type { ChunkConfiguration } from "@/types/chunk-type";

export type ChunkingVariant = {
  id: string;
  label: string;
  configuration: ChunkConfiguration;
  /**
   * Prepends a short provenance header to the text that gets embedded, as a
   * cheap stand-in for Contextual Retrieval. The header is stripped again
   * before judging, so labels describe the evidence and not the scaffolding.
   */
  contextHeader: boolean;
};

export type EmbeddingVariant = {
  id: string;
  label: string;
  model: string;
  /** Prefix applied to queries only. */
  queryPrefix: string;
  /** Prefix applied to passages only. Asymmetric models need both. */
  documentPrefix: string;
  batchSize: number;
};

export type RetrievalVariant = {
  id: string;
  label: string;
  strategy: "dense" | "sparse" | "hybrid";
};

export type RerankerVariant = {
  id: string;
  label: string;
  kind: "none" | "cross_encoder" | "llm_listwise" | "llm_pointwise";
  model?: string;
};

export const CHUNKING: ChunkingVariant[] = [
  {
    id: "a1",
    label: "200w/50 (baseline)",
    configuration: { wordSize: 200, overlapWords: 50 },
    contextHeader: false,
  },
  {
    id: "a2",
    label: "400w/80 (~512 tokens)",
    configuration: { wordSize: 400, overlapWords: 80 },
    contextHeader: false,
  },
  {
    id: "a3",
    label: "800w/150 (large)",
    configuration: { wordSize: 800, overlapWords: 150 },
    contextHeader: false,
  },
  {
    id: "a4",
    label: "400w/80 + context header",
    configuration: { wordSize: 400, overlapWords: 80 },
    contextHeader: true,
  },
];

const BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";
const QWEN_INSTRUCTION =
  "Instruct: Given an analyst's question about impact evidence, retrieve passages that report a relevant outcome, indicator, measurement or finding.\nQuery: ";

export const EMBEDDINGS: EmbeddingVariant[] = [
  {
    id: "b1",
    label: "bge-base-en-v1.5 (baseline)",
    model: "hf.co/CompendiumLabs/bge-base-en-v1.5-gguf",
    queryPrefix: BGE_QUERY_PREFIX,
    documentPrefix: "",
    batchSize: 16,
  },
  {
    id: "b2",
    label: "bge-m3",
    model: "bge-m3:latest",
    queryPrefix: "",
    documentPrefix: "",
    batchSize: 8,
  },
  {
    id: "b3",
    label: "nomic-embed-text (asymmetric)",
    model: "nomic-embed-text:latest",
    queryPrefix: "search_query: ",
    documentPrefix: "search_document: ",
    batchSize: 16,
  },
  {
    id: "b4",
    label: "qwen3-embedding-0.6b (instructed)",
    model: "qwen3-embedding:0.6b",
    queryPrefix: QWEN_INSTRUCTION,
    documentPrefix: "",
    batchSize: 8,
  },
];

export const RETRIEVAL: RetrievalVariant[] = [
  { id: "c1", label: "dense", strategy: "dense" },
  { id: "c2", label: "BM25 sparse", strategy: "sparse" },
  { id: "c3", label: "hybrid RRF", strategy: "hybrid" },
];

export const RERANKERS: RerankerVariant[] = [
  { id: "d1", label: "none", kind: "none" },
  {
    id: "d2",
    label: "ms-marco-MiniLM-L6 (baseline)",
    kind: "cross_encoder",
    model: "cross-encoder/ms-marco-MiniLM-L6-v2",
  },
  {
    id: "d3",
    label: "bge-reranker-base",
    kind: "cross_encoder",
    model: "Xenova/bge-reranker-base",
  },
  {
    id: "d4",
    label: "jina-reranker-v1-turbo-en",
    kind: "cross_encoder",
    model: "jinaai/jina-reranker-v1-turbo-en",
  },
  {
    id: "d5",
    label: "mxbai-rerank-xsmall-v1",
    kind: "cross_encoder",
    model: "mixedbread-ai/mxbai-rerank-xsmall-v1",
  },
  { id: "d6", label: "LLM listwise (qwen3.5:9b)", kind: "llm_listwise" },
  { id: "d7", label: "LLM pointwise (qwen3.5:9b)", kind: "llm_pointwise" },
];

/** Candidate pool depth retrieved and judged per question. */
export const POOL_DEPTH = 20;

/** Judge model for the pooled labels, and the independent cross-check model. */
export const JUDGE_MODEL = "qwen3.5:9b-q4_K_M";
export const SECOND_JUDGE_MODEL = "gemma3:12b";

export function collectionName(chunking: string, embedding: string): string {
  return `m4i_x_${chunking}_${embedding}`;
}

export function firstStageId(
  chunking: string,
  embedding: string,
  retrieval: string,
): string {
  return `${chunking}.${embedding}.${retrieval}`;
}

/** Short provenance header used by the a4 contextual variant. */
export function contextHeaderFor(title: string, source: string, page: number): string {
  const cleanTitle = title.replace(/\s+/g, " ").trim().slice(0, 180);

  return `[Document: ${cleanTitle} | Source: ${source} | Page ${page}]`;
}
