# Retrieval fixes and results

2026-10-16, branch `feature/retrieval-benchmark`. This follows [PIPELINE_AUDIT.md](PIPELINE_AUDIT.md), finding 4, and builds on the v4-flow chunks in [CHUNKING_RESULTS.md](CHUNKING_RESULTS.md).

**Summary:** the hierarchy pipeline's reranking step was discarding nearly everything. With MS MARCO scoring the composite category query and a 0.45 threshold, 80 of 84 ontology questions kept no chunk at all. It now reranks with `mxbai-rerank-xsmall-v1` on the bare question, after hybrid retrieval, with a 0.05 floor. On the 84 questions that raises NDCG@10 from 0.520 to 0.585. In the app-path check, 9 of 10 probes now pass chunks to the analyzer (before: 1 of 10).

## Changes

| Change | Where | Default now |
| --- | --- | --- |
| Hybrid retrieval: Qdrant reciprocal-rank fusion of dense and BM25 candidates (k = 60) | `QdrantStore.hybridSearch`, `Retriever` | Strategy `hybrid`, 100 candidates each |
| Header, footer and reference chunks excluded from every search | `retrievalFilter` | Excluded unless `includeAuxiliary` |
| `/api/rag` answers only from the request's documents | `RagPipeline.run` | Scoped by document ID and index fingerprint |
| BM25 length normalisation matched to passage length | `DEFAULT_BM25_OPTIONS` | `avg_len` 100 (Qdrant default 256) |
| Hierarchy retrieval and reranking use the question alone | `HierarchyPipeline` | Bare question; the analyzer still gets the category |
| Reranker model | `DEFAULT_RERANKING_CONFIGURATION` | `mixedbread-ai/mxbai-rerank-xsmall-v1` |
| Reranker threshold | `DEFAULT_HIERARCHY_CONFIGURATION` | 0.05 (was 0.45) |

## How it was measured

- **Rankings:** the 84 ontology questions were run through the app's own `Retriever` and `QdrantStore` on `rag_chunking_v4_flow` (all 700 PDFs, v4-flow chunks, `bge-base-en-v1.5` dense vectors plus Qdrant BM25), taking the top 20 per strategy across all documents.
- **Judging:** the rankings were added to the v4-flow benchmark and the same judge labelled the new candidates (7,848 judged pairs in total).
- **Rerankers:** every candidate was scored with four locally cached cross-encoders, with both the bare question and the hierarchy's composite query. The composite query is the dimension definition, category definition, include/exclude lists and question, 65–82 words.
- **Statistics:** intervals are 95% paired bootstrap intervals over the 84 questions.

## Retrieval strategies in the app

| App configuration | P@5 | NDCG@10 | MRR | Relevant word share |
| --- | ---: | ---: | ---: | ---: |
| Dense, bge-base | 0.519 | 0.520 | 0.710 | 0.557 |
| Hybrid, BM25 `avg_len` 100 | 0.521 | 0.520 | 0.713 | 0.535 |
| BM25, `avg_len` 100 | 0.538 | 0.506 | 0.700 | 0.535 |
| BM25, `avg_len` 256 (before) | 0.524 | 0.496 | 0.660 | 0.520 |
| *Benchmark: BGE-M3 dense, for reference* | *0.562* | *0.553* | *0.759* | *0.568* |

NDCG@10 differences:
- **BM25 `avg_len` 100 vs 256:** +0.011 [−0.010, +0.032]. Of BM25's top 20, 20% changed, and MRR rose from 0.660 to 0.700.
- **Hybrid vs dense:** −0.000 [−0.040, +0.040]. Hybrid vs BM25: +0.014 [−0.028, +0.056].

**Without reranking, hybrid and dense are equivalent with this embedder. Hybrid becomes the better first stage once a reranker reorders its candidates** (next table). BGE-M3 also outperforms the app's `bge-base` embedder, and it is multilingual.

## Rerankers

AUC measures how well the reranker separates relevant from irrelevant candidates (0.5 = random). The other columns are NDCG@10 after reranking each strategy's top 20, with the change against the original order.

| Reranker | Query | AUC | Rerank dense | Rerank hybrid |
| --- | --- | ---: | --- | --- |
| **mxbai-rerank-xsmall-v1** | **bare** | **0.628** | 0.561 (+0.041 [+0.004, +0.078]) | **0.585 (+0.065 [+0.034, +0.097])** |
| jina-reranker-v1-turbo-en | bare | 0.602 | 0.539 (+0.019 [−0.014, +0.052]) | 0.566 (+0.045 [+0.015, +0.075]) |
| ms-marco-MiniLM-L6-v2 | bare | 0.607 | 0.550 (+0.030 [+0.003, +0.057]) | 0.545 (+0.024 [−0.006, +0.055]) |
| bge-reranker-base | bare | 0.592 | 0.547 (+0.026 [−0.007, +0.059]) | 0.550 (+0.030 [−0.004, +0.064]) |
| ms-marco-MiniLM-L6-v2 (previous app setup) | composite | 0.511 | 0.504 (−0.016) | 0.515 (−0.006) |
| bge-reranker-base | composite | 0.540 | 0.518 (−0.002) | 0.527 (+0.007) |
| jina-reranker-v1-turbo-en | composite | 0.551 | 0.521 (+0.001) | 0.512 (−0.008) |
| mxbai-rerank-xsmall-v1 | composite | 0.493 | 0.518 (−0.002) | 0.532 (+0.012) |

With the composite query every reranker is close to random and none improves ranking. With the bare question all four help, and mxbai on hybrid candidates is best.

## Threshold

The hierarchy pipeline keeps the reranked top 12 above a probability floor. Below, recall is the share of relevant chunks in the reranked top 12 that survive the floor.

| Setup | Threshold | Questions with no chunk | Chunks kept per question | Precision of kept | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| Previous: ms-marco, composite query | 0.45 | **80 of 84** | 0.08 | 0.29 | 0.4% |
| mxbai, bare question | none | 0 | 12.0 | 0.549 | 100% |
| mxbai, bare question | **0.05** | **1** | **11.0** | **0.562** | **94%** |
| mxbai, bare question | 0.1 | 2 | 8.9 | 0.577 | 78% |
| mxbai, bare question | 0.2 | 14 | 4.9 | 0.657 | 49% |
| mxbai, bare question | 0.45 | 57 | 1.1 | 0.737 | 13% |

No reranker separates relevant passages sharply on these evaluative questions (best AUC 0.63), so every higher threshold trades large recall losses for small precision gains. The analyzer already judges each candidate and must ground every quote, so 0.05 only drops clear misses.

## App-path check

The five audit PDFs were run through ingestion and the hierarchy path into `pipeline_audit_v4`, with v4-flow chunks and the new retrieval defaults. "Before" is the original audit: v1 chunks and the previous retrieval.

| Document | Probe | Chunks passed (before → now) | Top chunk now |
| --- | --- | --- | --- |
| political-74 | advocacy | 0 → 11 | "If Congress determines that additional statutory provisions concerning agency roles are…" |
| environmental-72 | advocacy | 0 → 12 | Introduction on mitigation policies all countries should adopt |
| environmental-72 | emissions | 0 → 12 | 2050 emissions scenarios |
| humanitarian_rights-40 | advocacy | 0 → 10 | Summary on human rights and humanitarian law |
| humanitarian_rights-40 | protection | 3 → 2 | Same summary |
| economic-27 (French procurement plan) | advocacy | 0 → 11 | Project management unit set-up |
| economic-27 | livelihoods | 0 → 2 | Individual consultant recruitment table |
| education-77 (poor OCR scan) | advocacy | 0 → 1 | OCR-damaged passage on the teacher as an agent of change |
| education-77 | access | 0 → 0 | — |

## Remaining limitations and next steps

- **Re-index collections.** Existing collections (including `rag_test_document_ocr`) hold v1 chunks and BM25 vectors weighted with `avg_len` 256.
- **Upgrade the embedder.** BGE-M3 outperforms the default `bge-base-en-v1.5` (NDCG@10 0.553 vs 0.520) and handles the corpus's French, Spanish and Cyrillic-script documents. The BM25 stemmer and the chosen reranker are still English-only.
- **The reranker score is weakly calibrated** for these questions; keep the threshold low unless a better-separating reranker is found.
- **Bulk indexing on Windows.** `OllamaEmbedder` does not handle port exhaustion during bulk indexing (see CHUNKING_RESULTS.md).
- **Small samples and one judge.** All relevance labels come from one machine judge, and the app-path check covers five documents.
