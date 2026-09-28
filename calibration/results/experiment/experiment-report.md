# Retrieval experiment results

Generated 2026-09-08T22:00:42.524Z.

82 configurations over five axes, on 109 documents and the 84 questions in
`calibration/ontology.json`, scored against one shared pool of
16,364 relevance judgments.

## Headline

|  | nDCG@10 | P@5 | R@20 | MRR |
|---|---|---|---|---|
| baseline `a1.b1.c1` (200w, bge-base, dense) | 43.6% | 45.0% | 26.4% | 0.667 |
| best first stage `a3.b4.c3` | **63.5%** | **66.4%** | **39.1%** | **0.876** |

That gain is first-stage retrieval alone, with no reranker.

## Which axis mattered

Marginal mean nDCG@10, averaged over every setting of the other axes.

### embedding

| Variant | nDCG@10 | P@5 |
|---|---|---|
| qwen3-embedding-0.6b (instructed) | 57.6% | 59.8% |
| bge-m3 | 53.9% | 56.5% |
| nomic-embed-text (asymmetric) | 49.7% | 51.2% |
| bge-base-en-v1.5 (baseline) | 48.0% | 49.6% |

### retrieval

| Variant | nDCG@10 | P@5 |
|---|---|---|
| hybrid RRF | 54.9% | 57.1% |
| BM25 sparse | 51.0% | 53.8% |
| dense | 50.9% | 51.9% |

### chunking

| Variant | nDCG@10 | P@5 |
|---|---|---|
| 800w/150 (large) | 54.1% | 56.4% |
| 200w/50 (baseline) | 52.0% | 53.4% |
| 400w/80 + context header | 51.6% | 53.5% |
| 400w/80 (~512 tokens) | 51.4% | 53.8% |

The embedding model moved retrieval further than everything else combined. BM25
alone matching dense is what makes fusion worth it: the two fail on different
questions.

## Reranking

Rerankers were applied to already-judged pools, so all 28 runs cost no new labels.

### On the strongest pool (`a3.b4.c3`)

| Reranker | nDCG@10 | P@5 | AUC |
|---|---|---|---|
| LLM listwise (qwen3.5:9b) | 71.4% | 71.2% | 0.628 |
| LLM pointwise (qwen3.5:9b) | 71.1% | 70.2% | 0.688 |
| mxbai-rerank-xsmall-v1 | 68.4% | 66.2% | 0.635 |
| none | 67.9% | 66.4% | 0.590 |
| ms-marco-MiniLM-L6 (baseline) | 61.8% | 57.1% | 0.591 |
| bge-reranker-base | 59.7% | 57.1% | 0.563 |
| jina-reranker-v1-turbo-en | 59.6% | 57.4% | 0.547 |

### On the baseline pool (`a1.b1.c1`)

| Reranker | nDCG@10 | P@5 | AUC |
|---|---|---|---|
| LLM pointwise (qwen3.5:9b) | 71.2% | 61.7% | 0.750 |
| mxbai-rerank-xsmall-v1 | 63.4% | 54.3% | 0.680 |
| LLM listwise (qwen3.5:9b) | 60.3% | 52.1% | 0.613 |
| ms-marco-MiniLM-L6 (baseline) | 59.6% | 49.5% | 0.663 |
| jina-reranker-v1-turbo-en | 58.3% | 49.8% | 0.645 |
| bge-reranker-base | 57.8% | 51.2% | 0.646 |
| none | 52.5% | 45.0% | 0.577 |

The two tables tell opposite stories, and that is the finding: cross-encoders
**rescue a weak pool and damage a strong one**. They substitute for retrieval
quality rather than adding to it. Only the pointwise LLM rating improves both.

## Why the LLM rating is the one that can carry a threshold

Cross-encoder precision plateaus at every threshold. The pointwise rating does
not — precision rises monotonically with it, which is the property threshold
calibration needs and the property the original ms-marco score lacked.

## Operating point

Fitted on 42 calibration questions, measured on
42 held-out ones.

|  | precision | relevant/question | chunks/question |
|---|---|---|---|
| fixed k=5 | 68.1% | 3.40 | 5.00 |
| adaptive k | **76.5%** | **3.83** | **4.98** |

17 of the swept settings beat fixed k on all three axes
at once. Rejection catches 100.0% of
out-of-scope questions.

```ts
// types/retrieval-types.ts
{ acceptThreshold: 0.7, rejectThreshold: 0.6, minimumK: 1, maximumK: 8, relativeDropoff: 0.01 }
```

## Judge reliability

|  |  |
|---|---|
| Pairs compared | 504 |
| Primary judge | `qwen3.5:9b-q4_K_M` |
| Second judge | `gemma3:12b` |
| Primary says relevant | 56.5% |
| Second says relevant | 54.6% |
| Raw agreement | 69.4% |
| Cohen's kappa | 0.381 |

Kappa 0.38 is only "fair". Two consequences: measured AUC
understates true discrimination, because a third of the labels are contested;
and differences of one or two points anywhere above are inside label noise and
should not be read as real. The large effects — the embedding model, the
cross-encoder harm, the adaptive-k gain — are well outside it.

## Caveats

- Labels come from `qwen3.5:9b-q4_K_M`, which is also the model behind the two
  LLM reranker rows. Those rows are the ones most at risk of flattery; the
  agreement check above is the evidence that the bias is not total, not proof
  that it is absent.
- Stage 1 and stage 2 nDCG use different denominators — the pooled union across
  all 12 configurations in stage 1, the single pool in stage 2 — so compare
  within a stage, never across.
- The context-header chunking variant is a cheap stand-in for Contextual
  Retrieval, not the method itself. Its effect was inside noise, so that axis is
  untested rather than refuted.
- 109 documents is a sample. Re-run `calibration/download-corpus.mjs` with a
  larger `--per-topic` before treating any of this as settled.
