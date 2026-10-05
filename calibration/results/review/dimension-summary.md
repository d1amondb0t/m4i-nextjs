# Results across ontology dimensions

Computed from saved runs; no new model inference.

Sorted by P@5, with lower retrieved words as the tie-breaker. These are observed rankings, not independently validated per-dimension model choices. All lists have 20 candidates; words means the full 20-candidate pool. Chunk sizes differ, so this is not an equal-token-budget comparison. nDCG and recall share a denominator within each chunking only; recall is pooled, not exhaustive corpus recall. Stage 2 nDCG is recalculated against the stage 1 pooled union. CV means category-separated parameter selection on the same previously explored benchmark.

| Configuration | Words/overlap | Embedder | Retrieval | Reranker | P@5 | nDCG@10 | Pooled R@20 | Pool words |
|---|---|---|---|---|---|---|---|---|
| blend-a3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise + original-rank blend | 72.6% | 67.2% | 39.1% | 8655 |
| blend-a4 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise + original-rank blend | 72.4% | 68.7% | 36.7% | 6048 |
| a4.b4.c3-d7 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise | 71.2% | 68.3% | 36.7% | 6048 |
| a3.b4.c3-d6 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B listwise | 71.2% | 67.2% | 39.1% | 8655 |
| a3.b4.c3-d7 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise | 70.2% | 66.9% | 39.1% | 8655 |
| a4.b4.c1-d7 | 400/80 + header | Qwen3-embedding 0.6B | dense | Qwen3.5 9B pointwise | 70.0% | 67.8% | 38.4% | 5413 |
| a4.b4.c3-d6 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B listwise | 69.8% | 65.5% | 36.7% | 6048 |
| a4.b4.c1-d6 | 400/80 + header | Qwen3-embedding 0.6B | dense | Qwen3.5 9B listwise | 68.3% | 66.9% | 38.4% | 5413 |
| fusion-a3 | 800/150 | Qwen3-embedding 0.6B | tuned weighted RRF | none | 67.9% | 65.2% | 40.1% | 7423 |
| a4.b4.c1-d5 | 400/80 + header | Qwen3-embedding 0.6B | dense | Mixedbread xsmall | 67.1% | 63.9% | 38.4% | 5413 |
| a3.b4.c3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 66.4% | 63.5% | 39.1% | 8655 |
| a3.b4.c3-d5 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Mixedbread xsmall | 66.2% | 63.9% | 39.1% | 8655 |
| fusion-a2 | 400/80 | Qwen3-embedding 0.6B | tuned weighted RRF | none | 64.8% | 62.3% | 39.1% | 5345 |
| a4.b4.c3-d5 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Mixedbread xsmall | 64.8% | 61.8% | 36.7% | 6048 |
| live-ontology-add-0.25 | 400/80 + header | Qwen3-embedding 0.6B | ontology-add-0.25 | none | 64.8% | 61.4% | 34.0% | 6101 |
| live-ontology-add-0.5 | 400/80 + header | Qwen3-embedding 0.6B | ontology-add-0.5 | none | 64.5% | 61.3% | 34.0% | 6101 |
| fusion-a4 | 400/80 + header | Qwen3-embedding 0.6B | tuned weighted RRF | none | 63.8% | 61.3% | 37.4% | 5601 |
| a3.b4.c1 | 800/150 | Qwen3-embedding 0.6B | dense | none | 63.3% | 60.5% | 40.1% | 7423 |
| a2.b4.c1 | 400/80 | Qwen3-embedding 0.6B | dense | none | 62.9% | 60.3% | 39.1% | 5345 |
| a4.b4.c1 | 400/80 + header | Qwen3-embedding 0.6B | dense | none | 62.9% | 61.1% | 38.4% | 5413 |
| a1.b4.c3 | 200/50 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 62.6% | 59.0% | 37.7% | 3569 |
| a4.b4.c1-d2 | 400/80 + header | Qwen3-embedding 0.6B | dense | MiniLM-L6 | 62.4% | 60.9% | 38.4% | 5413 |
| a2.b4.c3 | 400/80 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 62.1% | 60.2% | 38.9% | 6042 |
| a1.b1.c1-d7 | 200/50 | BGE-base | dense | Qwen3.5 9B pointwise | 61.7% | 57.8% | 26.4% | 3379 |
| a4.b4.c3 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 61.7% | 62.1% | 36.7% | 6048 |
| live-original-rrf60 | 400/80 + header | Qwen3-embedding 0.6B | original-rrf60 | none | 61.7% | 62.2% | 33.8% | 6048 |
| a3.b2.c3 | 800/150 | BGE-M3 | hybrid RRF60, 1:1 | none | 61.2% | 58.5% | 37.0% | 9084 |
| a1.b4.c1 | 200/50 | Qwen3-embedding 0.6B | dense | none | 60.0% | 60.1% | 39.2% | 3367 |
| a1.b2.c3 | 200/50 | BGE-M3 | hybrid RRF60, 1:1 | none | 59.5% | 57.2% | 34.9% | 3562 |
| a4.b4.c1-d4 | 400/80 + header | Qwen3-embedding 0.6B | dense | Jina turbo | 59.3% | 58.1% | 38.4% | 5413 |
| a2.b2.c3 | 400/80 | BGE-M3 | hybrid RRF60, 1:1 | none | 59.0% | 56.0% | 35.8% | 6141 |
| a3.b2.c1 | 800/150 | BGE-M3 | dense | none | 58.8% | 55.1% | 35.7% | 8213 |
| live-ontology-replace-sparse | 400/80 + header | Qwen3-embedding 0.6B | ontology-replace-sparse | none | 58.6% | 55.6% | 31.8% | 6095 |
| a4.b4.c1-d3 | 400/80 + header | Qwen3-embedding 0.6B | dense | BGE-base reranker | 58.1% | 57.1% | 38.4% | 5413 |
| a1.b2.c1 | 200/50 | BGE-M3 | dense | none | 57.9% | 55.4% | 33.9% | 3426 |
| a3.b3.c3 | 800/150 | Nomic | hybrid RRF60, 1:1 | none | 57.9% | 54.3% | 34.9% | 8848 |
| a4.b4.c3-d2 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | MiniLM-L6 | 57.4% | 56.7% | 36.7% | 6048 |
| a3.b4.c3-d4 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Jina turbo | 57.4% | 56.1% | 39.1% | 8655 |
| a3.b4.c3-d2 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | MiniLM-L6 | 57.1% | 57.8% | 39.1% | 8655 |
| a3.b4.c3-d3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | BGE-base reranker | 57.1% | 55.8% | 39.1% | 8655 |
| a4.b2.c3 | 400/80 + header | BGE-M3 | hybrid RRF60, 1:1 | none | 56.2% | 55.6% | 34.7% | 5964 |
| a4.b4.c3-d3 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | BGE-base reranker | 56.0% | 55.2% | 36.7% | 6048 |
| a3.b1.c2 | 800/150 | BGE-base | BM25 | none | 56.0% | 53.3% | 33.9% | 10042 |
| a3.b2.c2 | 800/150 | BGE-M3 | BM25 | none | 56.0% | 53.3% | 33.9% | 10042 |
| a3.b3.c2 | 800/150 | Nomic | BM25 | none | 56.0% | 53.3% | 33.9% | 10042 |
| a3.b4.c2 | 800/150 | Qwen3-embedding 0.6B | BM25 | none | 56.0% | 53.3% | 33.9% | 10042 |
| a4.b2.c1 | 400/80 + header | BGE-M3 | dense | none | 55.5% | 53.0% | 34.3% | 5269 |
| a4.b4.c3-d4 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Jina turbo | 55.0% | 54.7% | 36.7% | 6048 |
| a3.b1.c3 | 800/150 | BGE-base | hybrid RRF60, 1:1 | none | 55.0% | 52.0% | 32.8% | 8588 |
| a2.b2.c1 | 400/80 | BGE-M3 | dense | none | 54.5% | 51.7% | 35.1% | 5535 |
| a1.b1.c1-d5 | 200/50 | BGE-base | dense | Mixedbread xsmall | 54.3% | 52.1% | 26.4% | 3379 |
| a2.b1.c2 | 400/80 | BGE-base | BM25 | none | 54.3% | 50.6% | 32.4% | 6780 |
| a2.b2.c2 | 400/80 | BGE-M3 | BM25 | none | 54.3% | 50.6% | 32.4% | 6780 |
| a2.b3.c2 | 400/80 | Nomic | BM25 | none | 54.3% | 50.6% | 32.4% | 6780 |
| a2.b4.c2 | 400/80 | Qwen3-embedding 0.6B | BM25 | none | 54.3% | 50.6% | 32.4% | 6780 |
| a4.b1.c2 | 400/80 + header | BGE-base | BM25 | none | 53.8% | 50.0% | 31.2% | 6754 |
| a4.b2.c2 | 400/80 + header | BGE-M3 | BM25 | none | 53.8% | 50.0% | 31.2% | 6754 |
| a4.b3.c2 | 400/80 + header | Nomic | BM25 | none | 53.8% | 50.0% | 31.2% | 6754 |
| a4.b4.c2 | 400/80 + header | Qwen3-embedding 0.6B | BM25 | none | 53.8% | 50.0% | 31.2% | 6754 |
| a2.b3.c3 | 400/80 | Nomic | hybrid RRF60, 1:1 | none | 52.9% | 51.1% | 33.9% | 6180 |
| a1.b3.c3 | 200/50 | Nomic | hybrid RRF60, 1:1 | none | 52.6% | 50.9% | 32.8% | 3667 |
| a4.b3.c3 | 400/80 + header | Nomic | hybrid RRF60, 1:1 | none | 52.4% | 50.2% | 31.6% | 5842 |
| a1.b1.c1-d6 | 200/50 | BGE-base | dense | Qwen3.5 9B listwise | 52.1% | 49.1% | 26.4% | 3379 |
| a1.b1.c3 | 200/50 | BGE-base | hybrid RRF60, 1:1 | none | 51.9% | 49.4% | 30.5% | 3544 |
| a1.b1.c1-d3 | 200/50 | BGE-base | dense | BGE-base reranker | 51.2% | 46.7% | 26.4% | 3379 |
| a1.b4.c2 | 200/50 | Qwen3-embedding 0.6B | BM25 | none | 51.2% | 50.2% | 30.5% | 3780 |
| a1.b1.c2 | 200/50 | BGE-base | BM25 | none | 51.2% | 50.2% | 30.5% | 3780 |
| a1.b2.c2 | 200/50 | BGE-M3 | BM25 | none | 51.2% | 50.2% | 30.5% | 3780 |
| a1.b3.c2 | 200/50 | Nomic | BM25 | none | 51.2% | 50.2% | 30.5% | 3780 |
| a2.b1.c3 | 400/80 | BGE-base | hybrid RRF60, 1:1 | none | 51.2% | 49.1% | 31.3% | 6061 |
| a4.b1.c3 | 400/80 + header | BGE-base | hybrid RRF60, 1:1 | none | 50.2% | 49.8% | 30.9% | 5744 |
| a1.b1.c1-d4 | 200/50 | BGE-base | dense | Jina turbo | 49.8% | 47.5% | 26.4% | 3379 |
| a1.b1.c1-d2 | 200/50 | BGE-base | dense | MiniLM-L6 | 49.5% | 48.0% | 26.4% | 3379 |
| a3.b3.c1 | 800/150 | Nomic | dense | none | 46.4% | 48.4% | 32.3% | 7510 |
| a2.b3.c1 | 400/80 | Nomic | dense | none | 46.2% | 45.5% | 30.5% | 5587 |
| a1.b3.c1 | 200/50 | Nomic | dense | none | 46.0% | 47.3% | 30.1% | 3559 |
| a1.b1.c1 | 200/50 | BGE-base | dense | none | 45.0% | 43.6% | 26.4% | 3379 |
| a4.b3.c1 | 400/80 + header | Nomic | dense | none | 44.5% | 44.1% | 30.3% | 4983 |
| a3.b1.c1 | 800/150 | BGE-base | dense | none | 43.8% | 44.3% | 29.5% | 7188 |
| a4.b1.c1 | 400/80 + header | BGE-base | dense | none | 43.1% | 43.4% | 28.5% | 4807 |
| a2.b1.c1 | 400/80 | BGE-base | dense | none | 39.5% | 39.8% | 28.1% | 5363 |

## Tuned configuration details

Fusion uses dense weight w and BM25 weight 1-w. Blend uses (1-w) times the pointwise LLM score plus w times the normalized original retrieval rank, 1 - zero-based-rank/20. Each setting is chosen on the training categories of that fold.

- blend-a3: 0.25; 0.5.
- blend-a4: 0.25; 0.5.
- fusion-a3: {"k":60,"weight":0.75}.
- fusion-a2: {"k":30,"weight":0.75}; {"k":60,"weight":0.75}.
- fusion-a4: {"k":30,"weight":0.75}; {"k":60,"weight":0.5}; {"k":10,"weight":0.5}.


## Political & governance — 12 questions

| Configuration | Words/overlap | Embedder | Retrieval | Reranker | P@5 | nDCG@10 | Pooled R@20 | Pool words |
|---|---|---|---|---|---|---|---|---|
| a4.b4.c1-d6 | 400/80 + header | Qwen3-embedding 0.6B | dense | Qwen3.5 9B listwise | 75.0% | 68.4% | 37.1% | 5183 |
| a4.b4.c1-d7 | 400/80 + header | Qwen3-embedding 0.6B | dense | Qwen3.5 9B pointwise | 73.3% | 68.0% | 37.1% | 5183 |
| blend-a4 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise + original-rank blend | 73.3% | 65.6% | 33.2% | 5894 |
| a1.b4.c3 | 200/50 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 71.7% | 63.8% | 36.9% | 3532 |
| fusion-a2 | 400/80 | Qwen3-embedding 0.6B | tuned weighted RRF | none | 71.7% | 66.4% | 34.6% | 5094 |
| a4.b4.c3-d7 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise | 71.7% | 66.7% | 33.2% | 5894 |
| a4.b4.c3-d6 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B listwise | 71.7% | 63.6% | 33.2% | 5894 |
| a4.b4.c1-d5 | 400/80 + header | Qwen3-embedding 0.6B | dense | Mixedbread xsmall | 68.3% | 65.5% | 37.1% | 5183 |
| fusion-a3 | 800/150 | Qwen3-embedding 0.6B | tuned weighted RRF | none | 68.3% | 63.9% | 35.2% | 6505 |
| a3.b4.c3-d6 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B listwise | 68.3% | 62.6% | 36.0% | 8202 |
| a3.b4.c3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 68.3% | 65.5% | 36.0% | 8202 |
| a4.b4.c1-d2 | 400/80 + header | Qwen3-embedding 0.6B | dense | MiniLM-L6 | 66.7% | 64.2% | 37.1% | 5183 |
| a4.b4.c1-d4 | 400/80 + header | Qwen3-embedding 0.6B | dense | Jina turbo | 66.7% | 62.7% | 37.1% | 5183 |
| a2.b4.c3 | 400/80 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 66.7% | 64.0% | 37.0% | 5789 |
| live-ontology-add-0.25 | 400/80 + header | Qwen3-embedding 0.6B | ontology-add-0.25 | none | 66.7% | 64.6% | 30.5% | 5984 |
| live-ontology-add-0.5 | 400/80 + header | Qwen3-embedding 0.6B | ontology-add-0.5 | none | 66.7% | 65.0% | 30.5% | 5984 |
| blend-a3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise + original-rank blend | 66.7% | 64.6% | 36.0% | 8202 |
| a1.b4.c1 | 200/50 | Qwen3-embedding 0.6B | dense | none | 65.0% | 63.0% | 38.5% | 3243 |
| a4.b4.c3 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 65.0% | 60.7% | 33.2% | 5894 |
| live-original-rrf60 | 400/80 + header | Qwen3-embedding 0.6B | original-rrf60 | none | 65.0% | 61.3% | 30.1% | 5894 |
| a3.b4.c3-d5 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Mixedbread xsmall | 65.0% | 63.2% | 36.0% | 8202 |
| a3.b4.c3-d3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | BGE-base reranker | 65.0% | 59.3% | 36.0% | 8202 |
| a1.b2.c3 | 200/50 | BGE-M3 | hybrid RRF60, 1:1 | none | 63.3% | 57.6% | 35.2% | 3408 |
| a4.b2.c1 | 400/80 + header | BGE-M3 | dense | none | 63.3% | 57.8% | 33.9% | 4266 |
| a2.b4.c1 | 400/80 | Qwen3-embedding 0.6B | dense | none | 63.3% | 62.7% | 34.6% | 5094 |
| a4.b4.c1 | 400/80 + header | Qwen3-embedding 0.6B | dense | none | 63.3% | 61.7% | 37.1% | 5183 |
| a4.b4.c1-d3 | 400/80 + header | Qwen3-embedding 0.6B | dense | BGE-base reranker | 63.3% | 59.3% | 37.1% | 5183 |
| fusion-a4 | 400/80 + header | Qwen3-embedding 0.6B | tuned weighted RRF | none | 63.3% | 58.1% | 33.9% | 5480 |
| a2.b2.c3 | 400/80 | BGE-M3 | hybrid RRF60, 1:1 | none | 63.3% | 58.8% | 36.3% | 5613 |
| a4.b4.c3-d5 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Mixedbread xsmall | 63.3% | 63.2% | 33.2% | 5894 |
| live-ontology-replace-sparse | 400/80 + header | Qwen3-embedding 0.6B | ontology-replace-sparse | none | 63.3% | 60.6% | 31.2% | 5958 |
| a3.b4.c3-d7 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise | 63.3% | 59.7% | 36.0% | 8202 |
| a2.b2.c1 | 400/80 | BGE-M3 | dense | none | 61.7% | 59.5% | 34.1% | 4753 |
| a4.b4.c3-d2 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | MiniLM-L6 | 61.7% | 56.1% | 33.2% | 5894 |
| a3.b4.c3-d2 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | MiniLM-L6 | 61.7% | 59.5% | 36.0% | 8202 |
| a4.b2.c3 | 400/80 + header | BGE-M3 | hybrid RRF60, 1:1 | none | 60.0% | 58.0% | 33.5% | 5404 |
| a3.b1.c2 | 800/150 | BGE-base | BM25 | none | 60.0% | 54.4% | 31.4% | 10317 |
| a3.b2.c2 | 800/150 | BGE-M3 | BM25 | none | 60.0% | 54.4% | 31.4% | 10317 |
| a3.b3.c2 | 800/150 | Nomic | BM25 | none | 60.0% | 54.4% | 31.4% | 10317 |
| a3.b4.c2 | 800/150 | Qwen3-embedding 0.6B | BM25 | none | 60.0% | 54.4% | 31.4% | 10317 |
| a1.b2.c1 | 200/50 | BGE-M3 | dense | none | 58.3% | 59.5% | 30.6% | 3131 |
| a1.b1.c1-d5 | 200/50 | BGE-base | dense | Mixedbread xsmall | 58.3% | 58.4% | 24.9% | 3184 |
| a2.b3.c3 | 400/80 | Nomic | hybrid RRF60, 1:1 | none | 58.3% | 53.4% | 29.9% | 6165 |
| a3.b2.c1 | 800/150 | BGE-M3 | dense | none | 58.3% | 56.7% | 35.6% | 6433 |
| a3.b4.c1 | 800/150 | Qwen3-embedding 0.6B | dense | none | 58.3% | 56.2% | 35.2% | 6505 |
| a3.b2.c3 | 800/150 | BGE-M3 | hybrid RRF60, 1:1 | none | 58.3% | 58.6% | 36.1% | 7946 |
| a1.b1.c1-d7 | 200/50 | BGE-base | dense | Qwen3.5 9B pointwise | 55.0% | 55.4% | 24.9% | 3184 |
| a1.b1.c1-d2 | 200/50 | BGE-base | dense | MiniLM-L6 | 55.0% | 49.6% | 24.9% | 3184 |
| a4.b4.c3-d3 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | BGE-base reranker | 55.0% | 54.6% | 33.2% | 5894 |
| a4.b4.c3-d4 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Jina turbo | 55.0% | 57.9% | 33.2% | 5894 |
| a2.b1.c2 | 400/80 | BGE-base | BM25 | none | 55.0% | 48.6% | 33.1% | 6860 |
| a2.b2.c2 | 400/80 | BGE-M3 | BM25 | none | 55.0% | 48.6% | 33.1% | 6860 |
| a2.b3.c2 | 400/80 | Nomic | BM25 | none | 55.0% | 48.6% | 33.1% | 6860 |
| a2.b4.c2 | 400/80 | Qwen3-embedding 0.6B | BM25 | none | 55.0% | 48.6% | 33.1% | 6860 |
| a1.b1.c1-d6 | 200/50 | BGE-base | dense | Qwen3.5 9B listwise | 53.3% | 47.8% | 24.9% | 3184 |
| a1.b3.c3 | 200/50 | Nomic | hybrid RRF60, 1:1 | none | 53.3% | 51.1% | 30.9% | 3695 |
| a1.b4.c2 | 200/50 | Qwen3-embedding 0.6B | BM25 | none | 53.3% | 53.1% | 30.2% | 3845 |
| a1.b1.c2 | 200/50 | BGE-base | BM25 | none | 53.3% | 52.8% | 30.2% | 3845 |
| a1.b2.c2 | 200/50 | BGE-M3 | BM25 | none | 53.3% | 52.8% | 30.2% | 3845 |
| a1.b3.c2 | 200/50 | Nomic | BM25 | none | 53.3% | 52.8% | 30.2% | 3845 |
| a4.b1.c3 | 400/80 + header | BGE-base | hybrid RRF60, 1:1 | none | 53.3% | 50.6% | 29.9% | 4792 |
| a4.b3.c3 | 400/80 + header | Nomic | hybrid RRF60, 1:1 | none | 53.3% | 48.9% | 30.9% | 5053 |
| a3.b1.c3 | 800/150 | BGE-base | hybrid RRF60, 1:1 | none | 53.3% | 51.4% | 31.8% | 8304 |
| a4.b1.c2 | 400/80 + header | BGE-base | BM25 | none | 51.7% | 46.9% | 29.6% | 6818 |
| a4.b2.c2 | 400/80 + header | BGE-M3 | BM25 | none | 51.7% | 46.9% | 29.6% | 6818 |
| a4.b3.c2 | 400/80 + header | Nomic | BM25 | none | 51.7% | 46.9% | 29.6% | 6818 |
| a4.b4.c2 | 400/80 + header | Qwen3-embedding 0.6B | BM25 | none | 51.7% | 46.9% | 29.6% | 6818 |
| a3.b4.c3-d4 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Jina turbo | 51.7% | 52.0% | 36.0% | 8202 |
| a1.b1.c1-d4 | 200/50 | BGE-base | dense | Jina turbo | 50.0% | 47.9% | 24.9% | 3184 |
| a1.b1.c3 | 200/50 | BGE-base | hybrid RRF60, 1:1 | none | 50.0% | 48.5% | 31.2% | 3469 |
| a3.b3.c3 | 800/150 | Nomic | hybrid RRF60, 1:1 | none | 48.3% | 50.2% | 32.0% | 8924 |
| a4.b1.c1 | 400/80 + header | BGE-base | dense | none | 46.7% | 46.8% | 32.8% | 3172 |
| a1.b1.c1-d3 | 200/50 | BGE-base | dense | BGE-base reranker | 46.7% | 40.6% | 24.9% | 3184 |
| a4.b3.c1 | 400/80 + header | Nomic | dense | none | 46.7% | 46.2% | 29.9% | 3651 |
| a2.b3.c1 | 400/80 | Nomic | dense | none | 46.7% | 46.7% | 25.8% | 5451 |
| a2.b1.c3 | 400/80 | BGE-base | hybrid RRF60, 1:1 | none | 46.7% | 46.5% | 29.2% | 5729 |
| a3.b3.c1 | 800/150 | Nomic | dense | none | 43.3% | 46.3% | 25.5% | 7286 |
| a1.b3.c1 | 200/50 | Nomic | dense | none | 41.7% | 46.4% | 27.1% | 3517 |
| a1.b1.c1 | 200/50 | BGE-base | dense | none | 40.0% | 42.7% | 24.9% | 3184 |
| a3.b1.c1 | 800/150 | BGE-base | dense | none | 38.3% | 42.1% | 27.2% | 6341 |
| a2.b1.c1 | 400/80 | BGE-base | dense | none | 33.3% | 38.5% | 26.6% | 4786 |

## Economy & finance — 12 questions

| Configuration | Words/overlap | Embedder | Retrieval | Reranker | P@5 | nDCG@10 | Pooled R@20 | Pool words |
|---|---|---|---|---|---|---|---|---|
| a3.b4.c3-d6 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B listwise | 75.0% | 74.2% | 36.7% | 9272 |
| a3.b4.c3-d5 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Mixedbread xsmall | 73.3% | 68.9% | 36.7% | 9272 |
| a4.b4.c3-d5 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Mixedbread xsmall | 71.7% | 64.2% | 37.5% | 6492 |
| a3.b2.c1 | 800/150 | BGE-M3 | dense | none | 71.7% | 69.7% | 41.0% | 9174 |
| a3.b4.c3-d7 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise | 71.7% | 69.4% | 36.7% | 9272 |
| a3.b2.c3 | 800/150 | BGE-M3 | hybrid RRF60, 1:1 | none | 71.7% | 68.0% | 40.8% | 9580 |
| a1.b1.c1-d7 | 200/50 | BGE-base | dense | Qwen3.5 9B pointwise | 70.0% | 62.0% | 26.2% | 3627 |
| a1.b4.c3 | 200/50 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 70.0% | 65.2% | 42.4% | 3652 |
| a4.b2.c3 | 400/80 + header | BGE-M3 | hybrid RRF60, 1:1 | none | 70.0% | 65.3% | 33.8% | 6321 |
| blend-a4 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise + original-rank blend | 70.0% | 68.5% | 37.5% | 6492 |
| a4.b4.c1-d5 | 400/80 + header | Qwen3-embedding 0.6B | dense | Mixedbread xsmall | 68.3% | 62.8% | 40.4% | 6117 |
| a4.b4.c3-d7 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise | 68.3% | 65.6% | 37.5% | 6492 |
| a2.b2.c3 | 400/80 | BGE-M3 | hybrid RRF60, 1:1 | none | 68.3% | 61.5% | 37.4% | 6590 |
| fusion-a3 | 800/150 | Qwen3-embedding 0.6B | tuned weighted RRF | none | 68.3% | 67.7% | 39.5% | 8339 |
| a3.b4.c1 | 800/150 | Qwen3-embedding 0.6B | dense | none | 68.3% | 67.5% | 39.5% | 8339 |
| a1.b4.c1 | 200/50 | Qwen3-embedding 0.6B | dense | none | 66.7% | 73.7% | 43.0% | 3479 |
| fusion-a2 | 400/80 | Qwen3-embedding 0.6B | tuned weighted RRF | none | 66.7% | 65.9% | 40.7% | 5989 |
| fusion-a4 | 400/80 + header | Qwen3-embedding 0.6B | tuned weighted RRF | none | 66.7% | 64.9% | 39.9% | 6198 |
| a2.b4.c3 | 400/80 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 66.7% | 64.6% | 40.6% | 6409 |
| a4.b4.c3-d6 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B listwise | 66.7% | 66.0% | 37.5% | 6492 |
| blend-a3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise + original-rank blend | 66.7% | 67.8% | 36.7% | 9272 |
| a3.b4.c3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 66.7% | 64.7% | 36.7% | 9272 |
| a2.b4.c1 | 400/80 | Qwen3-embedding 0.6B | dense | none | 65.0% | 60.5% | 40.7% | 5989 |
| a4.b4.c1-d2 | 400/80 + header | Qwen3-embedding 0.6B | dense | MiniLM-L6 | 65.0% | 62.2% | 40.4% | 6117 |
| a4.b4.c3 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 65.0% | 65.0% | 37.5% | 6492 |
| live-original-rrf60 | 400/80 + header | Qwen3-embedding 0.6B | original-rrf60 | none | 65.0% | 65.0% | 34.6% | 6492 |
| a4.b4.c3-d4 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Jina turbo | 65.0% | 59.6% | 37.5% | 6492 |
| a1.b2.c3 | 200/50 | BGE-M3 | hybrid RRF60, 1:1 | none | 63.3% | 57.9% | 32.8% | 3699 |
| a4.b3.c3 | 400/80 + header | Nomic | hybrid RRF60, 1:1 | none | 63.3% | 56.8% | 30.2% | 6143 |
| live-ontology-add-0.25 | 400/80 + header | Qwen3-embedding 0.6B | ontology-add-0.25 | none | 63.3% | 63.3% | 34.3% | 6502 |
| a3.b1.c3 | 800/150 | BGE-base | hybrid RRF60, 1:1 | none | 63.3% | 57.9% | 30.0% | 8968 |
| a3.b4.c3-d2 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | MiniLM-L6 | 63.3% | 60.9% | 36.7% | 9272 |
| a3.b4.c3-d3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | BGE-base reranker | 63.3% | 64.8% | 36.7% | 9272 |
| a2.b3.c3 | 400/80 | Nomic | hybrid RRF60, 1:1 | none | 61.7% | 58.3% | 36.5% | 6223 |
| a4.b4.c3-d2 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | MiniLM-L6 | 61.7% | 58.1% | 37.5% | 6492 |
| live-ontology-add-0.5 | 400/80 + header | Qwen3-embedding 0.6B | ontology-add-0.5 | none | 61.7% | 63.1% | 34.3% | 6502 |
| a3.b3.c3 | 800/150 | Nomic | hybrid RRF60, 1:1 | none | 61.7% | 58.7% | 34.4% | 8891 |
| a3.b4.c3-d4 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Jina turbo | 61.7% | 64.1% | 36.7% | 9272 |
| a1.b1.c1-d6 | 200/50 | BGE-base | dense | Qwen3.5 9B listwise | 60.0% | 54.1% | 26.2% | 3627 |
| a1.b3.c3 | 200/50 | Nomic | hybrid RRF60, 1:1 | none | 60.0% | 56.7% | 36.5% | 3706 |
| a4.b4.c1 | 400/80 + header | Qwen3-embedding 0.6B | dense | none | 60.0% | 58.8% | 40.4% | 6117 |
| a4.b2.c1 | 400/80 + header | BGE-M3 | dense | none | 60.0% | 56.4% | 37.8% | 6150 |
| a4.b1.c3 | 400/80 + header | BGE-base | hybrid RRF60, 1:1 | none | 60.0% | 55.4% | 31.2% | 6230 |
| a1.b2.c1 | 200/50 | BGE-M3 | dense | none | 58.3% | 52.3% | 34.5% | 3622 |
| a1.b3.c1 | 200/50 | Nomic | dense | none | 58.3% | 57.0% | 33.1% | 3638 |
| a4.b4.c1-d7 | 400/80 + header | Qwen3-embedding 0.6B | dense | Qwen3.5 9B pointwise | 58.3% | 60.7% | 40.4% | 6117 |
| a4.b4.c1-d6 | 400/80 + header | Qwen3-embedding 0.6B | dense | Qwen3.5 9B listwise | 58.3% | 65.1% | 40.4% | 6117 |
| a2.b1.c3 | 400/80 | BGE-base | hybrid RRF60, 1:1 | none | 58.3% | 53.4% | 30.3% | 6341 |
| a4.b1.c2 | 400/80 + header | BGE-base | BM25 | none | 58.3% | 54.0% | 34.0% | 6754 |
| a4.b2.c2 | 400/80 + header | BGE-M3 | BM25 | none | 58.3% | 54.0% | 34.0% | 6754 |
| a4.b3.c2 | 400/80 + header | Nomic | BM25 | none | 58.3% | 54.0% | 34.0% | 6754 |
| a4.b4.c2 | 400/80 + header | Qwen3-embedding 0.6B | BM25 | none | 58.3% | 54.0% | 34.0% | 6754 |
| a2.b3.c1 | 400/80 | Nomic | dense | none | 56.7% | 51.0% | 35.5% | 5593 |
| a2.b1.c2 | 400/80 | BGE-base | BM25 | none | 56.7% | 54.4% | 36.0% | 6790 |
| a2.b2.c2 | 400/80 | BGE-M3 | BM25 | none | 56.7% | 54.4% | 36.0% | 6790 |
| a2.b3.c2 | 400/80 | Nomic | BM25 | none | 56.7% | 54.4% | 36.0% | 6790 |
| a2.b4.c2 | 400/80 | Qwen3-embedding 0.6B | BM25 | none | 56.7% | 54.4% | 36.0% | 6790 |
| a1.b1.c1 | 200/50 | BGE-base | dense | none | 55.0% | 51.1% | 26.2% | 3627 |
| a1.b1.c3 | 200/50 | BGE-base | hybrid RRF60, 1:1 | none | 55.0% | 55.4% | 30.6% | 3667 |
| a3.b3.c1 | 800/150 | Nomic | dense | none | 55.0% | 57.2% | 31.8% | 7680 |
| a3.b1.c2 | 800/150 | BGE-base | BM25 | none | 55.0% | 55.5% | 32.8% | 9928 |
| a3.b2.c2 | 800/150 | BGE-M3 | BM25 | none | 55.0% | 55.5% | 32.8% | 9928 |
| a3.b3.c2 | 800/150 | Nomic | BM25 | none | 55.0% | 55.5% | 32.8% | 9928 |
| a3.b4.c2 | 800/150 | Qwen3-embedding 0.6B | BM25 | none | 55.0% | 55.5% | 32.8% | 9928 |
| a1.b1.c1-d5 | 200/50 | BGE-base | dense | Mixedbread xsmall | 53.3% | 50.7% | 26.2% | 3627 |
| a1.b4.c2 | 200/50 | Qwen3-embedding 0.6B | BM25 | none | 51.7% | 53.3% | 31.1% | 3792 |
| a1.b1.c2 | 200/50 | BGE-base | BM25 | none | 51.7% | 53.3% | 31.1% | 3792 |
| a1.b2.c2 | 200/50 | BGE-M3 | BM25 | none | 51.7% | 53.3% | 31.1% | 3792 |
| a1.b3.c2 | 200/50 | Nomic | BM25 | none | 51.7% | 53.3% | 31.1% | 3792 |
| a4.b3.c1 | 400/80 + header | Nomic | dense | none | 51.7% | 49.2% | 30.9% | 5562 |
| a4.b4.c1-d4 | 400/80 + header | Qwen3-embedding 0.6B | dense | Jina turbo | 51.7% | 55.8% | 40.4% | 6117 |
| a4.b4.c1-d3 | 400/80 + header | Qwen3-embedding 0.6B | dense | BGE-base reranker | 51.7% | 54.1% | 40.4% | 6117 |
| a2.b2.c1 | 400/80 | BGE-M3 | dense | none | 51.7% | 55.6% | 39.1% | 6264 |
| a4.b4.c3-d3 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | BGE-base reranker | 51.7% | 53.6% | 37.5% | 6492 |
| a1.b1.c1-d2 | 200/50 | BGE-base | dense | MiniLM-L6 | 50.0% | 49.9% | 26.2% | 3627 |
| live-ontology-replace-sparse | 400/80 + header | Qwen3-embedding 0.6B | ontology-replace-sparse | none | 50.0% | 48.2% | 28.4% | 6653 |
| a3.b1.c1 | 800/150 | BGE-base | dense | none | 50.0% | 52.0% | 30.2% | 8109 |
| a1.b1.c1-d4 | 200/50 | BGE-base | dense | Jina turbo | 48.3% | 45.4% | 26.2% | 3627 |
| a1.b1.c1-d3 | 200/50 | BGE-base | dense | BGE-base reranker | 45.0% | 45.6% | 26.2% | 3627 |
| a4.b1.c1 | 400/80 + header | BGE-base | dense | none | 45.0% | 47.4% | 31.9% | 5710 |
| a2.b1.c1 | 400/80 | BGE-base | dense | none | 40.0% | 40.0% | 29.2% | 5797 |

## Social impact — 12 questions

| Configuration | Words/overlap | Embedder | Retrieval | Reranker | P@5 | nDCG@10 | Pooled R@20 | Pool words |
|---|---|---|---|---|---|---|---|---|
| blend-a4 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise + original-rank blend | 80.0% | 74.1% | 37.9% | 6475 |
| a4.b4.c3-d7 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise | 80.0% | 74.8% | 37.9% | 6475 |
| blend-a3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise + original-rank blend | 80.0% | 71.1% | 40.7% | 10012 |
| a4.b4.c1-d6 | 400/80 + header | Qwen3-embedding 0.6B | dense | Qwen3.5 9B listwise | 76.7% | 70.1% | 38.8% | 6013 |
| a4.b4.c3-d6 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B listwise | 75.0% | 71.8% | 37.9% | 6475 |
| a3.b4.c3-d6 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B listwise | 75.0% | 68.1% | 40.7% | 10012 |
| a3.b4.c3-d7 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise | 75.0% | 73.0% | 40.7% | 10012 |
| a4.b4.c1-d7 | 400/80 + header | Qwen3-embedding 0.6B | dense | Qwen3.5 9B pointwise | 73.3% | 70.8% | 38.8% | 6013 |
| a1.b1.c1-d7 | 200/50 | BGE-base | dense | Qwen3.5 9B pointwise | 71.7% | 67.6% | 31.0% | 3584 |
| a1.b1.c3 | 200/50 | BGE-base | hybrid RRF60, 1:1 | none | 71.7% | 60.1% | 34.1% | 3672 |
| a1.b1.c1-d4 | 200/50 | BGE-base | dense | Jina turbo | 70.0% | 61.8% | 31.0% | 3584 |
| fusion-a3 | 800/150 | Qwen3-embedding 0.6B | tuned weighted RRF | none | 70.0% | 67.4% | 41.4% | 9046 |
| a1.b4.c3 | 200/50 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 68.3% | 64.5% | 42.0% | 3698 |
| a4.b4.c3-d5 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Mixedbread xsmall | 68.3% | 65.6% | 37.9% | 6475 |
| a3.b4.c3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 68.3% | 67.2% | 40.7% | 10012 |
| a3.b2.c3 | 800/150 | BGE-M3 | hybrid RRF60, 1:1 | none | 68.3% | 64.0% | 39.0% | 10300 |
| a4.b4.c1-d5 | 400/80 + header | Qwen3-embedding 0.6B | dense | Mixedbread xsmall | 66.7% | 60.5% | 38.8% | 6013 |
| a4.b4.c3-d4 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Jina turbo | 66.7% | 60.6% | 37.9% | 6475 |
| live-ontology-add-0.5 | 400/80 + header | Qwen3-embedding 0.6B | ontology-add-0.5 | none | 66.7% | 59.5% | 35.8% | 6492 |
| a3.b4.c1 | 800/150 | Qwen3-embedding 0.6B | dense | none | 66.7% | 63.2% | 41.4% | 9046 |
| a3.b4.c3-d3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | BGE-base reranker | 66.7% | 59.9% | 40.7% | 10012 |
| a1.b3.c3 | 200/50 | Nomic | hybrid RRF60, 1:1 | none | 65.0% | 61.1% | 36.6% | 3673 |
| fusion-a2 | 400/80 | Qwen3-embedding 0.6B | tuned weighted RRF | none | 65.0% | 61.2% | 37.6% | 5905 |
| live-ontology-add-0.25 | 400/80 + header | Qwen3-embedding 0.6B | ontology-add-0.25 | none | 65.0% | 59.6% | 35.8% | 6492 |
| a2.b1.c3 | 400/80 | BGE-base | hybrid RRF60, 1:1 | none | 65.0% | 57.2% | 33.7% | 6564 |
| a1.b1.c1-d6 | 200/50 | BGE-base | dense | Qwen3.5 9B listwise | 63.3% | 60.1% | 31.0% | 3584 |
| a1.b1.c1-d3 | 200/50 | BGE-base | dense | BGE-base reranker | 63.3% | 55.1% | 31.0% | 3584 |
| a1.b2.c3 | 200/50 | BGE-M3 | hybrid RRF60, 1:1 | none | 63.3% | 62.4% | 37.3% | 3696 |
| a2.b4.c1 | 400/80 | Qwen3-embedding 0.6B | dense | none | 63.3% | 58.6% | 37.6% | 5905 |
| fusion-a4 | 400/80 + header | Qwen3-embedding 0.6B | tuned weighted RRF | none | 63.3% | 61.2% | 38.8% | 6013 |
| a4.b1.c3 | 400/80 + header | BGE-base | hybrid RRF60, 1:1 | none | 63.3% | 57.2% | 34.2% | 6379 |
| a4.b2.c3 | 400/80 + header | BGE-M3 | hybrid RRF60, 1:1 | none | 63.3% | 57.3% | 34.5% | 6475 |
| a2.b3.c3 | 400/80 | Nomic | hybrid RRF60, 1:1 | none | 63.3% | 57.9% | 36.0% | 6484 |
| a2.b2.c3 | 400/80 | BGE-M3 | hybrid RRF60, 1:1 | none | 63.3% | 57.5% | 35.3% | 6648 |
| a2.b1.c2 | 400/80 | BGE-base | BM25 | none | 63.3% | 59.4% | 32.0% | 6900 |
| a2.b2.c2 | 400/80 | BGE-M3 | BM25 | none | 63.3% | 59.4% | 32.0% | 6900 |
| a2.b3.c2 | 400/80 | Nomic | BM25 | none | 63.3% | 59.4% | 32.0% | 6900 |
| a2.b4.c2 | 400/80 | Qwen3-embedding 0.6B | BM25 | none | 63.3% | 59.4% | 32.0% | 6900 |
| a3.b3.c3 | 800/150 | Nomic | hybrid RRF60, 1:1 | none | 63.3% | 61.1% | 37.5% | 9496 |
| a3.b4.c3-d5 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Mixedbread xsmall | 63.3% | 65.0% | 40.7% | 10012 |
| a1.b4.c1 | 200/50 | Qwen3-embedding 0.6B | dense | none | 61.7% | 63.3% | 39.7% | 3561 |
| a1.b1.c1-d5 | 200/50 | BGE-base | dense | Mixedbread xsmall | 61.7% | 55.7% | 31.0% | 3584 |
| a4.b4.c1 | 400/80 + header | Qwen3-embedding 0.6B | dense | none | 61.7% | 58.3% | 38.8% | 6013 |
| a4.b4.c1-d4 | 400/80 + header | Qwen3-embedding 0.6B | dense | Jina turbo | 61.7% | 61.7% | 38.8% | 6013 |
| a2.b4.c3 | 400/80 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 61.7% | 60.3% | 41.1% | 6466 |
| a4.b4.c3 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 61.7% | 63.5% | 37.9% | 6475 |
| live-original-rrf60 | 400/80 + header | Qwen3-embedding 0.6B | original-rrf60 | none | 61.7% | 63.5% | 34.8% | 6475 |
| a4.b4.c3-d3 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | BGE-base reranker | 61.7% | 59.5% | 37.9% | 6475 |
| a4.b1.c2 | 400/80 + header | BGE-base | BM25 | none | 61.7% | 59.0% | 32.6% | 6911 |
| a4.b2.c2 | 400/80 + header | BGE-M3 | BM25 | none | 61.7% | 59.0% | 32.6% | 6911 |
| a4.b3.c2 | 400/80 + header | Nomic | BM25 | none | 61.7% | 59.0% | 32.6% | 6911 |
| a4.b4.c2 | 400/80 + header | Qwen3-embedding 0.6B | BM25 | none | 61.7% | 59.0% | 32.6% | 6911 |
| a3.b4.c3-d4 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Jina turbo | 61.7% | 60.7% | 40.7% | 10012 |
| a1.b4.c2 | 200/50 | Qwen3-embedding 0.6B | BM25 | none | 60.0% | 60.4% | 35.3% | 3746 |
| a1.b1.c2 | 200/50 | BGE-base | BM25 | none | 60.0% | 60.4% | 35.3% | 3746 |
| a1.b2.c2 | 200/50 | BGE-M3 | BM25 | none | 60.0% | 60.4% | 35.3% | 3746 |
| a1.b3.c2 | 200/50 | Nomic | BM25 | none | 60.0% | 60.4% | 35.3% | 3746 |
| a4.b3.c3 | 400/80 + header | Nomic | hybrid RRF60, 1:1 | none | 60.0% | 58.4% | 33.3% | 6375 |
| a3.b2.c1 | 800/150 | BGE-M3 | dense | none | 60.0% | 55.7% | 37.4% | 9853 |
| a3.b4.c3-d2 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | MiniLM-L6 | 60.0% | 62.6% | 40.7% | 10012 |
| a1.b1.c1-d2 | 200/50 | BGE-base | dense | MiniLM-L6 | 58.3% | 56.1% | 31.0% | 3584 |
| a4.b4.c1-d2 | 400/80 + header | Qwen3-embedding 0.6B | dense | MiniLM-L6 | 58.3% | 57.2% | 38.8% | 6013 |
| a4.b4.c1-d3 | 400/80 + header | Qwen3-embedding 0.6B | dense | BGE-base reranker | 58.3% | 56.8% | 38.8% | 6013 |
| a4.b4.c3-d2 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | MiniLM-L6 | 58.3% | 60.3% | 37.9% | 6475 |
| a3.b1.c3 | 800/150 | BGE-base | hybrid RRF60, 1:1 | none | 58.3% | 55.8% | 35.3% | 9662 |
| a3.b1.c2 | 800/150 | BGE-base | BM25 | none | 58.3% | 56.3% | 36.3% | 10871 |
| a3.b2.c2 | 800/150 | BGE-M3 | BM25 | none | 58.3% | 56.3% | 36.3% | 10871 |
| a3.b3.c2 | 800/150 | Nomic | BM25 | none | 58.3% | 56.3% | 36.3% | 10871 |
| a3.b4.c2 | 800/150 | Qwen3-embedding 0.6B | BM25 | none | 58.3% | 56.3% | 36.3% | 10871 |
| a1.b3.c1 | 200/50 | Nomic | dense | none | 55.0% | 55.1% | 31.8% | 3631 |
| a3.b1.c1 | 800/150 | BGE-base | dense | none | 55.0% | 51.0% | 33.1% | 8858 |
| a1.b2.c1 | 200/50 | BGE-M3 | dense | none | 53.3% | 57.7% | 36.7% | 3629 |
| a1.b1.c1 | 200/50 | BGE-base | dense | none | 51.7% | 51.7% | 31.0% | 3584 |
| a4.b1.c1 | 400/80 + header | BGE-base | dense | none | 51.7% | 51.9% | 27.4% | 5762 |
| a2.b2.c1 | 400/80 | BGE-M3 | dense | none | 51.7% | 48.3% | 37.0% | 6271 |
| a3.b3.c1 | 800/150 | Nomic | dense | none | 51.7% | 54.9% | 37.5% | 8374 |
| a2.b3.c1 | 400/80 | Nomic | dense | none | 48.3% | 50.1% | 33.2% | 6014 |
| a4.b2.c1 | 400/80 + header | BGE-M3 | dense | none | 48.3% | 49.9% | 34.0% | 6125 |
| a4.b3.c1 | 400/80 + header | Nomic | dense | none | 45.0% | 47.3% | 32.1% | 5733 |
| a2.b1.c1 | 400/80 | BGE-base | dense | none | 45.0% | 44.5% | 31.9% | 6270 |
| live-ontology-replace-sparse | 400/80 + header | Qwen3-embedding 0.6B | ontology-replace-sparse | none | 45.0% | 49.0% | 31.5% | 6586 |

## Environment & climate — 12 questions

| Configuration | Words/overlap | Embedder | Retrieval | Reranker | P@5 | nDCG@10 | Pooled R@20 | Pool words |
|---|---|---|---|---|---|---|---|---|
| a4.b4.c3-d7 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise | 83.3% | 76.8% | 39.7% | 5411 |
| a4.b4.c1-d6 | 400/80 + header | Qwen3-embedding 0.6B | dense | Qwen3.5 9B listwise | 81.7% | 78.6% | 40.7% | 4805 |
| blend-a3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise + original-rank blend | 80.0% | 71.2% | 40.0% | 7775 |
| a3.b4.c3-d6 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B listwise | 80.0% | 70.7% | 40.0% | 7775 |
| a4.b4.c1-d7 | 400/80 + header | Qwen3-embedding 0.6B | dense | Qwen3.5 9B pointwise | 76.7% | 75.6% | 40.7% | 4805 |
| blend-a4 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise + original-rank blend | 76.7% | 75.6% | 39.7% | 5411 |
| a3.b4.c3-d7 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise | 76.7% | 70.4% | 40.0% | 7775 |
| a3.b4.c3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 76.7% | 68.1% | 40.0% | 7775 |
| a4.b4.c3-d6 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B listwise | 75.0% | 69.8% | 39.7% | 5411 |
| a1.b2.c3 | 200/50 | BGE-M3 | hybrid RRF60, 1:1 | none | 73.3% | 67.1% | 38.4% | 3580 |
| a4.b4.c1-d5 | 400/80 + header | Qwen3-embedding 0.6B | dense | Mixedbread xsmall | 73.3% | 71.0% | 40.7% | 4805 |
| fusion-a3 | 800/150 | Qwen3-embedding 0.6B | tuned weighted RRF | none | 73.3% | 71.9% | 44.7% | 6660 |
| a1.b1.c1-d7 | 200/50 | BGE-base | dense | Qwen3.5 9B pointwise | 71.7% | 68.0% | 31.7% | 3387 |
| live-ontology-replace-sparse | 400/80 + header | Qwen3-embedding 0.6B | ontology-replace-sparse | none | 71.7% | 65.0% | 37.6% | 5399 |
| a4.b4.c3-d5 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Mixedbread xsmall | 71.7% | 69.9% | 39.7% | 5411 |
| a4.b2.c1 | 400/80 + header | BGE-M3 | dense | none | 71.7% | 63.0% | 37.9% | 5501 |
| live-ontology-add-0.5 | 400/80 + header | Qwen3-embedding 0.6B | ontology-add-0.5 | none | 71.7% | 64.3% | 37.2% | 5535 |
| live-ontology-add-0.25 | 400/80 + header | Qwen3-embedding 0.6B | ontology-add-0.25 | none | 70.0% | 64.4% | 37.2% | 5535 |
| a3.b4.c3-d5 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Mixedbread xsmall | 70.0% | 67.1% | 40.0% | 7775 |
| a1.b2.c1 | 200/50 | BGE-M3 | dense | none | 68.3% | 65.7% | 39.1% | 3572 |
| a4.b4.c1 | 400/80 + header | Qwen3-embedding 0.6B | dense | none | 68.3% | 67.4% | 40.7% | 4805 |
| a2.b2.c3 | 400/80 | BGE-M3 | hybrid RRF60, 1:1 | none | 68.3% | 62.9% | 37.8% | 5846 |
| a3.b3.c3 | 800/150 | Nomic | hybrid RRF60, 1:1 | none | 68.3% | 62.8% | 38.3% | 8124 |
| a2.b4.c1 | 400/80 | Qwen3-embedding 0.6B | dense | none | 66.7% | 67.3% | 43.8% | 4926 |
| a1.b1.c1-d5 | 200/50 | BGE-base | dense | Mixedbread xsmall | 65.0% | 60.6% | 31.7% | 3387 |
| a1.b4.c3 | 200/50 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 65.0% | 63.8% | 38.1% | 3443 |
| a4.b4.c1-d2 | 400/80 + header | Qwen3-embedding 0.6B | dense | MiniLM-L6 | 65.0% | 65.2% | 40.7% | 4805 |
| fusion-a2 | 400/80 | Qwen3-embedding 0.6B | tuned weighted RRF | none | 65.0% | 63.4% | 43.8% | 4926 |
| fusion-a4 | 400/80 + header | Qwen3-embedding 0.6B | tuned weighted RRF | none | 65.0% | 64.0% | 40.4% | 5209 |
| a2.b2.c1 | 400/80 | BGE-M3 | dense | none | 65.0% | 61.3% | 37.8% | 5671 |
| a2.b3.c3 | 400/80 | Nomic | hybrid RRF60, 1:1 | none | 65.0% | 57.5% | 36.6% | 5737 |
| a3.b4.c1 | 800/150 | Qwen3-embedding 0.6B | dense | none | 65.0% | 67.4% | 44.7% | 6660 |
| a4.b4.c3 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 63.3% | 63.9% | 39.7% | 5411 |
| live-original-rrf60 | 400/80 + header | Qwen3-embedding 0.6B | original-rrf60 | none | 63.3% | 63.9% | 36.8% | 5411 |
| a2.b4.c3 | 400/80 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 63.3% | 60.1% | 41.1% | 5518 |
| a2.b1.c3 | 400/80 | BGE-base | hybrid RRF60, 1:1 | none | 63.3% | 54.8% | 36.3% | 5705 |
| a3.b1.c3 | 800/150 | BGE-base | hybrid RRF60, 1:1 | none | 63.3% | 59.6% | 36.8% | 7982 |
| a3.b2.c1 | 800/150 | BGE-M3 | dense | none | 63.3% | 59.3% | 36.6% | 8419 |
| a3.b2.c3 | 800/150 | BGE-M3 | hybrid RRF60, 1:1 | none | 63.3% | 60.5% | 36.7% | 8862 |
| a3.b1.c2 | 800/150 | BGE-base | BM25 | none | 63.3% | 57.5% | 37.1% | 9813 |
| a3.b2.c2 | 800/150 | BGE-M3 | BM25 | none | 63.3% | 57.5% | 37.1% | 9813 |
| a3.b3.c2 | 800/150 | Nomic | BM25 | none | 63.3% | 57.5% | 37.1% | 9813 |
| a3.b4.c2 | 800/150 | Qwen3-embedding 0.6B | BM25 | none | 63.3% | 57.5% | 37.1% | 9813 |
| a1.b1.c1-d6 | 200/50 | BGE-base | dense | Qwen3.5 9B listwise | 61.7% | 58.7% | 31.7% | 3387 |
| a1.b4.c2 | 200/50 | Qwen3-embedding 0.6B | BM25 | none | 61.7% | 56.3% | 30.8% | 3769 |
| a1.b1.c2 | 200/50 | BGE-base | BM25 | none | 61.7% | 56.3% | 30.8% | 3769 |
| a1.b2.c2 | 200/50 | BGE-M3 | BM25 | none | 61.7% | 56.3% | 30.8% | 3769 |
| a1.b3.c2 | 200/50 | Nomic | BM25 | none | 61.7% | 56.3% | 30.8% | 3769 |
| a4.b4.c3-d2 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | MiniLM-L6 | 61.7% | 58.9% | 39.7% | 5411 |
| a4.b4.c3-d4 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Jina turbo | 61.7% | 56.0% | 39.7% | 5411 |
| a4.b1.c2 | 400/80 + header | BGE-base | BM25 | none | 61.7% | 57.4% | 33.1% | 6412 |
| a4.b2.c2 | 400/80 + header | BGE-M3 | BM25 | none | 61.7% | 57.4% | 33.1% | 6412 |
| a4.b3.c2 | 400/80 + header | Nomic | BM25 | none | 61.7% | 57.4% | 33.1% | 6412 |
| a4.b4.c2 | 400/80 + header | Qwen3-embedding 0.6B | BM25 | none | 61.7% | 57.4% | 33.1% | 6412 |
| a3.b4.c3-d4 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Jina turbo | 61.7% | 57.3% | 40.0% | 7775 |
| a1.b4.c1 | 200/50 | Qwen3-embedding 0.6B | dense | none | 60.0% | 59.8% | 42.4% | 3277 |
| a4.b4.c1-d4 | 400/80 + header | Qwen3-embedding 0.6B | dense | Jina turbo | 60.0% | 63.2% | 40.7% | 4805 |
| a4.b3.c3 | 400/80 + header | Nomic | hybrid RRF60, 1:1 | none | 60.0% | 54.7% | 36.9% | 5594 |
| a4.b2.c3 | 400/80 + header | BGE-M3 | hybrid RRF60, 1:1 | none | 60.0% | 65.5% | 38.1% | 5766 |
| a2.b1.c2 | 400/80 | BGE-base | BM25 | none | 60.0% | 55.5% | 34.1% | 6481 |
| a2.b2.c2 | 400/80 | BGE-M3 | BM25 | none | 60.0% | 55.5% | 34.1% | 6481 |
| a2.b3.c2 | 400/80 | Nomic | BM25 | none | 60.0% | 55.5% | 34.1% | 6481 |
| a2.b4.c2 | 400/80 | Qwen3-embedding 0.6B | BM25 | none | 60.0% | 55.5% | 34.1% | 6481 |
| a4.b4.c3-d3 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | BGE-base reranker | 58.3% | 62.4% | 39.7% | 5411 |
| a3.b4.c3-d3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | BGE-base reranker | 58.3% | 55.2% | 40.0% | 7775 |
| a1.b1.c1-d4 | 200/50 | BGE-base | dense | Jina turbo | 56.7% | 54.3% | 31.7% | 3387 |
| a1.b1.c1-d2 | 200/50 | BGE-base | dense | MiniLM-L6 | 56.7% | 54.1% | 31.7% | 3387 |
| a4.b4.c1-d3 | 400/80 + header | Qwen3-embedding 0.6B | dense | BGE-base reranker | 56.7% | 58.5% | 40.7% | 4805 |
| a1.b1.c1-d3 | 200/50 | BGE-base | dense | BGE-base reranker | 55.0% | 51.8% | 31.7% | 3387 |
| a1.b1.c3 | 200/50 | BGE-base | hybrid RRF60, 1:1 | none | 55.0% | 52.6% | 34.3% | 3497 |
| a1.b3.c3 | 200/50 | Nomic | hybrid RRF60, 1:1 | none | 53.3% | 54.0% | 33.1% | 3566 |
| a4.b1.c1 | 400/80 + header | BGE-base | dense | none | 53.3% | 52.1% | 29.8% | 5111 |
| a3.b3.c1 | 800/150 | Nomic | dense | none | 53.3% | 54.5% | 38.6% | 6409 |
| a2.b1.c1 | 400/80 | BGE-base | dense | none | 51.7% | 48.6% | 32.0% | 5004 |
| a2.b3.c1 | 400/80 | Nomic | dense | none | 51.7% | 50.3% | 37.3% | 5244 |
| a4.b1.c3 | 400/80 + header | BGE-base | hybrid RRF60, 1:1 | none | 51.7% | 55.5% | 37.2% | 5595 |
| a3.b1.c1 | 800/150 | BGE-base | dense | none | 51.7% | 53.1% | 34.0% | 6234 |
| a3.b4.c3-d2 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | MiniLM-L6 | 51.7% | 53.1% | 40.0% | 7775 |
| a1.b1.c1 | 200/50 | BGE-base | dense | none | 50.0% | 48.3% | 31.7% | 3387 |
| a4.b3.c1 | 400/80 + header | Nomic | dense | none | 48.3% | 49.9% | 33.0% | 5039 |
| a1.b3.c1 | 200/50 | Nomic | dense | none | 41.7% | 43.7% | 31.6% | 3418 |

## Urban structures & transport — 12 questions

| Configuration | Words/overlap | Embedder | Retrieval | Reranker | P@5 | nDCG@10 | Pooled R@20 | Pool words |
|---|---|---|---|---|---|---|---|---|
| a4.b4.c1-d7 | 400/80 + header | Qwen3-embedding 0.6B | dense | Qwen3.5 9B pointwise | 70.0% | 64.6% | 38.5% | 5420 |
| blend-a4 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise + original-rank blend | 70.0% | 64.9% | 38.1% | 6164 |
| blend-a3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise + original-rank blend | 70.0% | 65.6% | 43.5% | 8608 |
| fusion-a3 | 800/150 | Qwen3-embedding 0.6B | tuned weighted RRF | none | 68.3% | 64.6% | 38.1% | 7326 |
| a3.b4.c3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 68.3% | 63.3% | 43.5% | 8608 |
| a2.b4.c1 | 400/80 | Qwen3-embedding 0.6B | dense | none | 66.7% | 57.1% | 42.3% | 5562 |
| a3.b4.c3-d7 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise | 66.7% | 66.2% | 43.5% | 8608 |
| a4.b4.c3-d6 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B listwise | 65.0% | 60.3% | 38.1% | 6164 |
| a3.b4.c1 | 800/150 | Qwen3-embedding 0.6B | dense | none | 65.0% | 57.1% | 38.1% | 7326 |
| a4.b4.c1 | 400/80 + header | Qwen3-embedding 0.6B | dense | none | 63.3% | 62.5% | 38.5% | 5420 |
| fusion-a2 | 400/80 | Qwen3-embedding 0.6B | tuned weighted RRF | none | 63.3% | 58.6% | 42.3% | 5562 |
| a4.b4.c1-d6 | 400/80 + header | Qwen3-embedding 0.6B | dense | Qwen3.5 9B listwise | 61.7% | 61.4% | 38.5% | 5420 |
| live-ontology-replace-sparse | 400/80 + header | Qwen3-embedding 0.6B | ontology-replace-sparse | none | 61.7% | 53.4% | 34.4% | 6149 |
| a2.b4.c3 | 400/80 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 60.0% | 54.7% | 38.2% | 6116 |
| a4.b4.c3-d7 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise | 60.0% | 62.3% | 38.1% | 6164 |
| a3.b4.c3-d6 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B listwise | 60.0% | 58.7% | 43.5% | 8608 |
| fusion-a4 | 400/80 + header | Qwen3-embedding 0.6B | tuned weighted RRF | none | 56.7% | 57.1% | 36.3% | 5760 |
| a4.b4.c1-d2 | 400/80 + header | Qwen3-embedding 0.6B | dense | MiniLM-L6 | 55.0% | 54.9% | 38.5% | 5420 |
| a4.b4.c1-d3 | 400/80 + header | Qwen3-embedding 0.6B | dense | BGE-base reranker | 55.0% | 50.6% | 38.5% | 5420 |
| a4.b4.c3 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 55.0% | 55.9% | 38.1% | 6164 |
| live-original-rrf60 | 400/80 + header | Qwen3-embedding 0.6B | original-rrf60 | none | 55.0% | 55.9% | 35.7% | 6164 |
| live-ontology-add-0.25 | 400/80 + header | Qwen3-embedding 0.6B | ontology-add-0.25 | none | 55.0% | 52.5% | 35.0% | 6189 |
| a3.b4.c3-d5 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Mixedbread xsmall | 55.0% | 53.1% | 43.5% | 8608 |
| a3.b4.c3-d4 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Jina turbo | 55.0% | 51.0% | 43.5% | 8608 |
| a3.b4.c3-d3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | BGE-base reranker | 55.0% | 52.0% | 43.5% | 8608 |
| live-ontology-add-0.5 | 400/80 + header | Qwen3-embedding 0.6B | ontology-add-0.5 | none | 53.3% | 52.6% | 35.0% | 6189 |
| a3.b4.c3-d2 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | MiniLM-L6 | 53.3% | 55.1% | 43.5% | 8608 |
| a4.b4.c1-d4 | 400/80 + header | Qwen3-embedding 0.6B | dense | Jina turbo | 51.7% | 47.1% | 38.5% | 5420 |
| a3.b3.c3 | 800/150 | Nomic | hybrid RRF60, 1:1 | none | 51.7% | 46.8% | 36.6% | 9021 |
| a3.b1.c2 | 800/150 | BGE-base | BM25 | none | 51.7% | 52.9% | 37.6% | 10114 |
| a3.b2.c2 | 800/150 | BGE-M3 | BM25 | none | 51.7% | 52.9% | 37.6% | 10114 |
| a3.b3.c2 | 800/150 | Nomic | BM25 | none | 51.7% | 52.9% | 37.6% | 10114 |
| a3.b4.c2 | 800/150 | Qwen3-embedding 0.6B | BM25 | none | 51.7% | 52.9% | 37.6% | 10114 |
| a4.b4.c1-d5 | 400/80 + header | Qwen3-embedding 0.6B | dense | Mixedbread xsmall | 50.0% | 52.7% | 38.5% | 5420 |
| a1.b4.c3 | 200/50 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 48.3% | 41.8% | 37.9% | 3670 |
| a3.b2.c3 | 800/150 | BGE-M3 | hybrid RRF60, 1:1 | none | 48.3% | 48.4% | 38.1% | 9683 |
| a1.b4.c1 | 200/50 | Qwen3-embedding 0.6B | dense | none | 46.7% | 47.9% | 36.7% | 3382 |
| a2.b2.c3 | 400/80 | BGE-M3 | hybrid RRF60, 1:1 | none | 46.7% | 43.9% | 33.7% | 6224 |
| a1.b1.c1-d7 | 200/50 | BGE-base | dense | Qwen3.5 9B pointwise | 45.0% | 40.2% | 21.2% | 3438 |
| a1.b1.c1-d3 | 200/50 | BGE-base | dense | BGE-base reranker | 45.0% | 38.6% | 21.2% | 3438 |
| a1.b2.c1 | 200/50 | BGE-M3 | dense | none | 45.0% | 39.2% | 29.3% | 3585 |
| a2.b2.c1 | 400/80 | BGE-M3 | dense | none | 45.0% | 35.7% | 29.1% | 5711 |
| a1.b2.c3 | 200/50 | BGE-M3 | hybrid RRF60, 1:1 | none | 41.7% | 41.3% | 33.5% | 3677 |
| a4.b2.c1 | 400/80 + header | BGE-M3 | dense | none | 41.7% | 38.7% | 29.6% | 5639 |
| a4.b4.c3-d5 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Mixedbread xsmall | 41.7% | 43.2% | 38.1% | 6164 |
| a4.b4.c3-d2 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | MiniLM-L6 | 41.7% | 46.8% | 38.1% | 6164 |
| a4.b4.c3-d3 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | BGE-base reranker | 41.7% | 41.0% | 38.1% | 6164 |
| a3.b1.c3 | 800/150 | BGE-base | hybrid RRF60, 1:1 | none | 41.7% | 41.5% | 33.3% | 8359 |
| a4.b2.c3 | 400/80 + header | BGE-M3 | hybrid RRF60, 1:1 | none | 40.0% | 39.3% | 32.6% | 6173 |
| a3.b2.c1 | 800/150 | BGE-M3 | dense | none | 40.0% | 37.0% | 28.7% | 9012 |
| a4.b3.c3 | 400/80 + header | Nomic | hybrid RRF60, 1:1 | none | 38.3% | 37.4% | 26.6% | 6067 |
| a2.b1.c2 | 400/80 | BGE-base | BM25 | none | 38.3% | 37.0% | 30.4% | 6768 |
| a2.b2.c2 | 400/80 | BGE-M3 | BM25 | none | 38.3% | 37.0% | 30.4% | 6768 |
| a2.b3.c2 | 400/80 | Nomic | BM25 | none | 38.3% | 37.0% | 30.4% | 6768 |
| a2.b4.c2 | 400/80 | Qwen3-embedding 0.6B | BM25 | none | 38.3% | 37.0% | 30.4% | 6768 |
| a4.b4.c3-d4 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Jina turbo | 36.7% | 42.0% | 38.1% | 6164 |
| a4.b1.c2 | 400/80 + header | BGE-base | BM25 | none | 36.7% | 35.6% | 30.0% | 6722 |
| a4.b2.c2 | 400/80 + header | BGE-M3 | BM25 | none | 36.7% | 35.6% | 30.0% | 6722 |
| a4.b3.c2 | 400/80 + header | Nomic | BM25 | none | 36.7% | 35.6% | 30.0% | 6722 |
| a4.b4.c2 | 400/80 + header | Qwen3-embedding 0.6B | BM25 | none | 36.7% | 35.6% | 30.0% | 6722 |
| a1.b1.c1-d5 | 200/50 | BGE-base | dense | Mixedbread xsmall | 35.0% | 34.6% | 21.2% | 3438 |
| a1.b1.c1-d2 | 200/50 | BGE-base | dense | MiniLM-L6 | 35.0% | 36.6% | 21.2% | 3438 |
| a4.b3.c1 | 400/80 + header | Nomic | dense | none | 35.0% | 30.2% | 28.1% | 5391 |
| a2.b3.c1 | 400/80 | Nomic | dense | none | 35.0% | 30.4% | 24.1% | 5899 |
| a2.b3.c3 | 400/80 | Nomic | hybrid RRF60, 1:1 | none | 35.0% | 36.2% | 31.3% | 6348 |
| a1.b1.c1-d4 | 200/50 | BGE-base | dense | Jina turbo | 33.3% | 35.2% | 21.2% | 3438 |
| a1.b4.c2 | 200/50 | Qwen3-embedding 0.6B | BM25 | none | 33.3% | 34.6% | 27.2% | 3813 |
| a1.b1.c2 | 200/50 | BGE-base | BM25 | none | 33.3% | 34.6% | 27.2% | 3813 |
| a1.b2.c2 | 200/50 | BGE-M3 | BM25 | none | 33.3% | 34.6% | 27.2% | 3813 |
| a1.b3.c2 | 200/50 | Nomic | BM25 | none | 33.3% | 34.6% | 27.2% | 3813 |
| a4.b1.c3 | 400/80 + header | BGE-base | hybrid RRF60, 1:1 | none | 33.3% | 36.3% | 26.9% | 5724 |
| a2.b1.c3 | 400/80 | BGE-base | hybrid RRF60, 1:1 | none | 33.3% | 35.3% | 28.4% | 6150 |
| a3.b3.c1 | 800/150 | Nomic | dense | none | 33.3% | 35.7% | 26.8% | 8159 |
| a1.b1.c1-d6 | 200/50 | BGE-base | dense | Qwen3.5 9B listwise | 31.7% | 32.8% | 21.2% | 3438 |
| a1.b3.c3 | 200/50 | Nomic | hybrid RRF60, 1:1 | none | 31.7% | 32.1% | 30.2% | 3707 |
| a1.b1.c1 | 200/50 | BGE-base | dense | none | 30.0% | 26.0% | 21.2% | 3438 |
| a1.b1.c3 | 200/50 | BGE-base | hybrid RRF60, 1:1 | none | 30.0% | 31.3% | 27.1% | 3597 |
| a1.b3.c1 | 200/50 | Nomic | dense | none | 28.3% | 29.8% | 27.8% | 3630 |
| a3.b1.c1 | 800/150 | BGE-base | dense | none | 28.3% | 27.7% | 24.7% | 6781 |
| a4.b1.c1 | 400/80 + header | BGE-base | dense | none | 26.7% | 25.4% | 23.5% | 4471 |
| a2.b1.c1 | 400/80 | BGE-base | dense | none | 26.7% | 24.8% | 24.6% | 5508 |

## Humanitarian concerns, law & rights — 12 questions

| Configuration | Words/overlap | Embedder | Retrieval | Reranker | P@5 | nDCG@10 | Pooled R@20 | Pool words |
|---|---|---|---|---|---|---|---|---|
| blend-a3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise + original-rank blend | 78.3% | 69.8% | 36.9% | 9359 |
| a3.b4.c3-d6 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B listwise | 78.3% | 75.0% | 36.9% | 9359 |
| a3.b4.c3-d7 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise | 76.7% | 71.4% | 36.9% | 9359 |
| a4.b4.c3-d7 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise | 75.0% | 73.8% | 34.7% | 6165 |
| blend-a4 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise + original-rank blend | 73.3% | 72.9% | 34.7% | 6165 |
| a4.b4.c1-d7 | 400/80 + header | Qwen3-embedding 0.6B | dense | Qwen3.5 9B pointwise | 71.7% | 69.3% | 34.1% | 5752 |
| a4.b4.c1-d5 | 400/80 + header | Qwen3-embedding 0.6B | dense | Mixedbread xsmall | 71.7% | 69.0% | 34.1% | 5752 |
| a4.b4.c3-d6 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B listwise | 71.7% | 68.0% | 34.7% | 6165 |
| a4.b4.c3-d5 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Mixedbread xsmall | 70.0% | 68.0% | 34.7% | 6165 |
| a3.b4.c3-d5 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Mixedbread xsmall | 68.3% | 68.0% | 36.9% | 9359 |
| a4.b4.c3-d3 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | BGE-base reranker | 66.7% | 59.0% | 34.7% | 6165 |
| a4.b4.c1 | 400/80 + header | Qwen3-embedding 0.6B | dense | none | 65.0% | 59.1% | 34.1% | 5752 |
| a4.b4.c1-d2 | 400/80 + header | Qwen3-embedding 0.6B | dense | MiniLM-L6 | 65.0% | 62.8% | 34.1% | 5752 |
| a4.b4.c3-d2 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | MiniLM-L6 | 65.0% | 62.5% | 34.7% | 6165 |
| live-ontology-add-0.25 | 400/80 + header | Qwen3-embedding 0.6B | ontology-add-0.25 | none | 65.0% | 61.9% | 32.6% | 6228 |
| a3.b1.c2 | 800/150 | BGE-base | BM25 | none | 65.0% | 55.8% | 33.0% | 9920 |
| a3.b2.c2 | 800/150 | BGE-M3 | BM25 | none | 65.0% | 55.8% | 33.0% | 9920 |
| a3.b3.c2 | 800/150 | Nomic | BM25 | none | 65.0% | 55.8% | 33.0% | 9920 |
| a3.b4.c2 | 800/150 | Qwen3-embedding 0.6B | BM25 | none | 65.0% | 55.8% | 33.0% | 9920 |
| a4.b4.c1-d3 | 400/80 + header | Qwen3-embedding 0.6B | dense | BGE-base reranker | 63.3% | 59.0% | 34.1% | 5752 |
| a2.b4.c1 | 400/80 | Qwen3-embedding 0.6B | dense | none | 63.3% | 58.6% | 33.7% | 5770 |
| live-ontology-add-0.5 | 400/80 + header | Qwen3-embedding 0.6B | ontology-add-0.5 | none | 63.3% | 61.5% | 32.6% | 6228 |
| fusion-a3 | 800/150 | Qwen3-embedding 0.6B | tuned weighted RRF | none | 63.3% | 59.8% | 37.4% | 8792 |
| a4.b4.c1-d6 | 400/80 + header | Qwen3-embedding 0.6B | dense | Qwen3.5 9B listwise | 61.7% | 63.0% | 34.1% | 5752 |
| a3.b4.c3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 61.7% | 62.3% | 36.9% | 9359 |
| a3.b2.c3 | 800/150 | BGE-M3 | hybrid RRF60, 1:1 | none | 61.7% | 58.6% | 33.3% | 9700 |
| fusion-a4 | 400/80 + header | Qwen3-embedding 0.6B | tuned weighted RRF | none | 60.0% | 59.8% | 33.4% | 5945 |
| a4.b4.c3 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 60.0% | 63.4% | 34.7% | 6165 |
| live-original-rrf60 | 400/80 + header | Qwen3-embedding 0.6B | original-rrf60 | none | 60.0% | 63.4% | 32.6% | 6165 |
| a2.b1.c2 | 400/80 | BGE-base | BM25 | none | 60.0% | 57.0% | 31.4% | 6872 |
| a2.b2.c2 | 400/80 | BGE-M3 | BM25 | none | 60.0% | 57.0% | 31.4% | 6872 |
| a2.b3.c2 | 400/80 | Nomic | BM25 | none | 60.0% | 57.0% | 31.4% | 6872 |
| a2.b4.c2 | 400/80 | Qwen3-embedding 0.6B | BM25 | none | 60.0% | 57.0% | 31.4% | 6872 |
| a4.b1.c2 | 400/80 + header | BGE-base | BM25 | none | 60.0% | 55.6% | 31.8% | 6875 |
| a4.b2.c2 | 400/80 + header | BGE-M3 | BM25 | none | 60.0% | 55.6% | 31.8% | 6875 |
| a4.b3.c2 | 400/80 + header | Nomic | BM25 | none | 60.0% | 55.6% | 31.8% | 6875 |
| a4.b4.c2 | 400/80 + header | Qwen3-embedding 0.6B | BM25 | none | 60.0% | 55.6% | 31.8% | 6875 |
| a3.b4.c1 | 800/150 | Qwen3-embedding 0.6B | dense | none | 60.0% | 56.5% | 37.4% | 8792 |
| a3.b4.c3-d2 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | MiniLM-L6 | 60.0% | 59.2% | 36.9% | 9359 |
| a1.b2.c1 | 200/50 | BGE-M3 | dense | none | 58.3% | 54.9% | 32.4% | 3508 |
| a1.b4.c3 | 200/50 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 58.3% | 57.8% | 31.0% | 3569 |
| a3.b2.c1 | 800/150 | BGE-M3 | dense | none | 58.3% | 54.2% | 31.6% | 9187 |
| a3.b4.c3-d4 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Jina turbo | 58.3% | 53.6% | 36.9% | 9359 |
| a3.b3.c3 | 800/150 | Nomic | hybrid RRF60, 1:1 | none | 58.3% | 53.0% | 32.3% | 9504 |
| a1.b4.c1 | 200/50 | Qwen3-embedding 0.6B | dense | none | 56.7% | 52.5% | 32.0% | 3504 |
| a1.b2.c3 | 200/50 | BGE-M3 | hybrid RRF60, 1:1 | none | 56.7% | 59.3% | 32.9% | 3546 |
| a1.b4.c2 | 200/50 | Qwen3-embedding 0.6B | BM25 | none | 56.7% | 53.1% | 29.5% | 3749 |
| a1.b1.c2 | 200/50 | BGE-base | BM25 | none | 56.7% | 53.1% | 29.5% | 3749 |
| a1.b2.c2 | 200/50 | BGE-M3 | BM25 | none | 56.7% | 53.1% | 29.5% | 3749 |
| a1.b3.c2 | 200/50 | Nomic | BM25 | none | 56.7% | 53.1% | 29.5% | 3749 |
| fusion-a2 | 400/80 | Qwen3-embedding 0.6B | tuned weighted RRF | none | 56.7% | 58.5% | 33.7% | 5770 |
| a4.b4.c1-d4 | 400/80 + header | Qwen3-embedding 0.6B | dense | Jina turbo | 55.0% | 54.4% | 34.1% | 5752 |
| a2.b4.c3 | 400/80 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 55.0% | 59.4% | 36.0% | 6330 |
| a1.b1.c1-d7 | 200/50 | BGE-base | dense | Qwen3.5 9B pointwise | 53.3% | 54.9% | 22.8% | 3568 |
| a1.b3.c3 | 200/50 | Nomic | hybrid RRF60, 1:1 | none | 53.3% | 52.0% | 31.0% | 3716 |
| live-ontology-replace-sparse | 400/80 + header | Qwen3-embedding 0.6B | ontology-replace-sparse | none | 53.3% | 54.9% | 26.0% | 6140 |
| a2.b2.c3 | 400/80 | BGE-M3 | hybrid RRF60, 1:1 | none | 51.7% | 52.9% | 34.1% | 6527 |
| a3.b1.c3 | 800/150 | BGE-base | hybrid RRF60, 1:1 | none | 51.7% | 50.2% | 30.4% | 9484 |
| a1.b1.c1-d5 | 200/50 | BGE-base | dense | Mixedbread xsmall | 50.0% | 46.9% | 22.8% | 3568 |
| a4.b3.c3 | 400/80 + header | Nomic | hybrid RRF60, 1:1 | none | 50.0% | 49.6% | 32.1% | 6044 |
| a4.b4.c3-d4 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Jina turbo | 50.0% | 55.2% | 34.7% | 6165 |
| a1.b3.c1 | 200/50 | Nomic | dense | none | 48.3% | 50.3% | 28.8% | 3630 |
| a4.b2.c1 | 400/80 + header | BGE-M3 | dense | none | 48.3% | 52.7% | 30.0% | 5673 |
| a2.b2.c1 | 400/80 | BGE-M3 | dense | none | 48.3% | 48.5% | 30.8% | 5974 |
| a4.b2.c3 | 400/80 + header | BGE-M3 | hybrid RRF60, 1:1 | none | 48.3% | 51.6% | 36.8% | 6312 |
| a4.b1.c3 | 400/80 + header | BGE-base | hybrid RRF60, 1:1 | none | 48.3% | 51.2% | 30.4% | 6374 |
| a1.b1.c1-d6 | 200/50 | BGE-base | dense | Qwen3.5 9B listwise | 45.0% | 44.0% | 22.8% | 3568 |
| a1.b1.c3 | 200/50 | BGE-base | hybrid RRF60, 1:1 | none | 45.0% | 44.2% | 27.1% | 3591 |
| a2.b3.c3 | 400/80 | Nomic | hybrid RRF60, 1:1 | none | 45.0% | 48.1% | 32.6% | 6347 |
| a1.b1.c1-d3 | 200/50 | BGE-base | dense | BGE-base reranker | 43.3% | 42.2% | 22.8% | 3568 |
| a4.b3.c1 | 400/80 + header | Nomic | dense | none | 43.3% | 43.7% | 26.3% | 5200 |
| a2.b3.c1 | 400/80 | Nomic | dense | none | 43.3% | 44.1% | 26.4% | 5864 |
| a3.b4.c3-d3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | BGE-base reranker | 43.3% | 47.8% | 36.9% | 9359 |
| a4.b1.c1 | 400/80 + header | BGE-base | dense | none | 41.7% | 43.4% | 25.6% | 5987 |
| a1.b1.c1-d2 | 200/50 | BGE-base | dense | MiniLM-L6 | 40.0% | 39.6% | 22.8% | 3568 |
| a2.b1.c3 | 400/80 | BGE-base | hybrid RRF60, 1:1 | none | 40.0% | 43.7% | 30.2% | 6300 |
| a3.b3.c1 | 800/150 | Nomic | dense | none | 40.0% | 44.1% | 28.9% | 8521 |
| a1.b1.c1-d4 | 200/50 | BGE-base | dense | Jina turbo | 38.3% | 39.2% | 22.8% | 3568 |
| a3.b1.c1 | 800/150 | BGE-base | dense | none | 36.7% | 37.3% | 24.4% | 8841 |
| a1.b1.c1 | 200/50 | BGE-base | dense | none | 35.0% | 38.8% | 22.8% | 3568 |
| a2.b1.c1 | 400/80 | BGE-base | dense | none | 35.0% | 36.3% | 22.8% | 5806 |

## Education — 12 questions

| Configuration | Words/overlap | Embedder | Retrieval | Reranker | P@5 | nDCG@10 | Pooled R@20 | Pool words |
|---|---|---|---|---|---|---|---|---|
| a4.b4.c1-d5 | 400/80 + header | Qwen3-embedding 0.6B | dense | Mixedbread xsmall | 71.7% | 65.7% | 39.3% | 4602 |
| fusion-a4 | 400/80 + header | Qwen3-embedding 0.6B | tuned weighted RRF | none | 71.7% | 63.5% | 39.3% | 4602 |
| a4.b4.c1-d4 | 400/80 + header | Qwen3-embedding 0.6B | dense | Jina turbo | 68.3% | 61.8% | 39.3% | 4602 |
| live-ontology-add-0.25 | 400/80 + header | Qwen3-embedding 0.6B | ontology-add-0.25 | none | 68.3% | 63.3% | 32.7% | 5780 |
| live-ontology-add-0.5 | 400/80 + header | Qwen3-embedding 0.6B | ontology-add-0.5 | none | 68.3% | 63.4% | 32.7% | 5780 |
| a3.b4.c3-d5 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Mixedbread xsmall | 68.3% | 62.3% | 40.1% | 7357 |
| a4.b4.c1-d7 | 400/80 + header | Qwen3-embedding 0.6B | dense | Qwen3.5 9B pointwise | 66.7% | 65.4% | 39.3% | 4602 |
| a4.b4.c3-d5 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Mixedbread xsmall | 66.7% | 58.3% | 35.6% | 5734 |
| blend-a3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise + original-rank blend | 66.7% | 60.6% | 40.1% | 7357 |
| a1.b1.c1-d7 | 200/50 | BGE-base | dense | Qwen3.5 9B pointwise | 65.0% | 56.7% | 27.3% | 2866 |
| fusion-a2 | 400/80 | Qwen3-embedding 0.6B | tuned weighted RRF | none | 65.0% | 62.4% | 41.2% | 4167 |
| live-ontology-replace-sparse | 400/80 + header | Qwen3-embedding 0.6B | ontology-replace-sparse | none | 65.0% | 58.0% | 33.6% | 5780 |
| a1.b2.c1 | 200/50 | BGE-M3 | dense | none | 63.3% | 58.7% | 34.8% | 2934 |
| a1.b4.c1 | 200/50 | Qwen3-embedding 0.6B | dense | none | 63.3% | 60.6% | 42.0% | 3121 |
| a4.b4.c1-d6 | 400/80 + header | Qwen3-embedding 0.6B | dense | Qwen3.5 9B listwise | 63.3% | 61.7% | 39.3% | 4602 |
| fusion-a3 | 800/150 | Qwen3-embedding 0.6B | tuned weighted RRF | none | 63.3% | 61.5% | 44.3% | 5292 |
| blend-a4 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise + original-rank blend | 63.3% | 59.6% | 35.6% | 5734 |
| a4.b4.c3-d6 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B listwise | 63.3% | 59.1% | 35.6% | 5734 |
| a4.b4.c1-d2 | 400/80 + header | Qwen3-embedding 0.6B | dense | MiniLM-L6 | 61.7% | 59.7% | 39.3% | 4602 |
| a2.b4.c3 | 400/80 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 61.7% | 58.5% | 37.9% | 5668 |
| a4.b4.c3 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 61.7% | 62.4% | 35.6% | 5734 |
| live-original-rrf60 | 400/80 + header | Qwen3-embedding 0.6B | original-rrf60 | none | 61.7% | 62.1% | 32.1% | 5734 |
| a3.b4.c3-d6 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B listwise | 61.7% | 60.8% | 40.1% | 7357 |
| a3.b4.c3-d7 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise | 61.7% | 58.2% | 40.1% | 7357 |
| a1.b1.c1-d3 | 200/50 | BGE-base | dense | BGE-base reranker | 60.0% | 53.1% | 27.3% | 2866 |
| a3.b4.c1 | 800/150 | Qwen3-embedding 0.6B | dense | none | 60.0% | 55.9% | 44.3% | 5292 |
| a3.b2.c1 | 800/150 | BGE-M3 | dense | none | 60.0% | 53.0% | 38.6% | 5415 |
| a4.b4.c3-d7 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Qwen3.5 9B pointwise | 60.0% | 58.2% | 35.6% | 5734 |
| a2.b2.c1 | 400/80 | BGE-M3 | dense | none | 58.3% | 52.6% | 37.9% | 4099 |
| a4.b4.c1 | 400/80 + header | Qwen3-embedding 0.6B | dense | none | 58.3% | 60.0% | 39.3% | 4602 |
| a4.b4.c1-d3 | 400/80 + header | Qwen3-embedding 0.6B | dense | BGE-base reranker | 58.3% | 61.5% | 39.3% | 4602 |
| a1.b1.c1-d5 | 200/50 | BGE-base | dense | Mixedbread xsmall | 56.7% | 57.7% | 27.3% | 2866 |
| a1.b1.c3 | 200/50 | BGE-base | hybrid RRF60, 1:1 | none | 56.7% | 53.7% | 28.9% | 3319 |
| a1.b4.c3 | 200/50 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 56.7% | 56.4% | 35.8% | 3417 |
| a4.b4.c3-d3 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | BGE-base reranker | 56.7% | 56.1% | 35.6% | 5734 |
| a3.b2.c3 | 800/150 | BGE-M3 | hybrid RRF60, 1:1 | none | 56.7% | 51.2% | 34.8% | 7517 |
| a1.b2.c3 | 200/50 | BGE-M3 | hybrid RRF60, 1:1 | none | 55.0% | 54.7% | 33.8% | 3332 |
| a4.b2.c1 | 400/80 + header | BGE-M3 | dense | none | 55.0% | 52.5% | 36.6% | 3530 |
| a3.b4.c3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | none | 55.0% | 53.6% | 40.1% | 7357 |
| a1.b1.c1 | 200/50 | BGE-base | dense | none | 53.3% | 46.8% | 27.3% | 2866 |
| a3.b1.c3 | 800/150 | BGE-base | hybrid RRF60, 1:1 | none | 53.3% | 47.7% | 32.0% | 7356 |
| a3.b3.c3 | 800/150 | Nomic | hybrid RRF60, 1:1 | none | 53.3% | 47.5% | 33.2% | 7977 |
| a1.b1.c1-d4 | 200/50 | BGE-base | dense | Jina turbo | 51.7% | 48.6% | 27.3% | 2866 |
| a1.b1.c1-d2 | 200/50 | BGE-base | dense | MiniLM-L6 | 51.7% | 50.4% | 27.3% | 2866 |
| a1.b3.c3 | 200/50 | Nomic | hybrid RRF60, 1:1 | none | 51.7% | 49.0% | 30.9% | 3607 |
| a2.b4.c1 | 400/80 | Qwen3-embedding 0.6B | dense | none | 51.7% | 57.3% | 41.2% | 4167 |
| a4.b2.c3 | 400/80 + header | BGE-M3 | hybrid RRF60, 1:1 | none | 51.7% | 52.2% | 33.6% | 5298 |
| a2.b2.c3 | 400/80 | BGE-M3 | hybrid RRF60, 1:1 | none | 51.7% | 54.5% | 35.9% | 5538 |
| a2.b1.c3 | 400/80 | BGE-base | hybrid RRF60, 1:1 | none | 51.7% | 52.6% | 31.1% | 5637 |
| a4.b4.c3-d2 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | MiniLM-L6 | 51.7% | 54.4% | 35.6% | 5734 |
| a3.b4.c3-d4 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Jina turbo | 51.7% | 53.9% | 40.1% | 7357 |
| a1.b1.c1-d6 | 200/50 | BGE-base | dense | Qwen3.5 9B listwise | 50.0% | 46.5% | 27.3% | 2866 |
| a4.b4.c3-d4 | 400/80 + header | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | Jina turbo | 50.0% | 51.2% | 35.6% | 5734 |
| a3.b4.c3-d2 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | MiniLM-L6 | 50.0% | 54.0% | 40.1% | 7357 |
| a1.b3.c1 | 200/50 | Nomic | dense | none | 48.3% | 49.0% | 30.2% | 3449 |
| a3.b3.c1 | 800/150 | Nomic | dense | none | 48.3% | 45.9% | 36.8% | 6140 |
| a3.b4.c3-d3 | 800/150 | Qwen3-embedding 0.6B | hybrid RRF60, 1:1 | BGE-base reranker | 48.3% | 51.9% | 40.1% | 7357 |
| a3.b1.c1 | 800/150 | BGE-base | dense | none | 46.7% | 47.0% | 33.2% | 5154 |
| a4.b1.c2 | 400/80 + header | BGE-base | BM25 | none | 46.7% | 41.6% | 27.4% | 6785 |
| a4.b2.c2 | 400/80 + header | BGE-M3 | BM25 | none | 46.7% | 41.6% | 27.4% | 6785 |
| a4.b3.c2 | 400/80 + header | Nomic | BM25 | none | 46.7% | 41.6% | 27.4% | 6785 |
| a4.b4.c2 | 400/80 + header | Qwen3-embedding 0.6B | BM25 | none | 46.7% | 41.6% | 27.4% | 6785 |
| a2.b1.c2 | 400/80 | BGE-base | BM25 | none | 46.7% | 42.6% | 30.1% | 6790 |
| a2.b2.c2 | 400/80 | BGE-M3 | BM25 | none | 46.7% | 42.6% | 30.1% | 6790 |
| a2.b3.c2 | 400/80 | Nomic | BM25 | none | 46.7% | 42.6% | 30.1% | 6790 |
| a2.b4.c2 | 400/80 | Qwen3-embedding 0.6B | BM25 | none | 46.7% | 42.6% | 30.1% | 6790 |
| a2.b1.c1 | 400/80 | BGE-base | dense | none | 45.0% | 46.0% | 29.6% | 4371 |
| a1.b4.c2 | 200/50 | Qwen3-embedding 0.6B | BM25 | none | 41.7% | 40.8% | 29.1% | 3748 |
| a1.b1.c2 | 200/50 | BGE-base | BM25 | none | 41.7% | 40.8% | 29.1% | 3748 |
| a1.b2.c2 | 200/50 | BGE-M3 | BM25 | none | 41.7% | 40.8% | 29.1% | 3748 |
| a1.b3.c2 | 200/50 | Nomic | BM25 | none | 41.7% | 40.8% | 29.1% | 3748 |
| a4.b3.c1 | 400/80 + header | Nomic | dense | none | 41.7% | 42.3% | 31.8% | 4306 |
| a2.b3.c1 | 400/80 | Nomic | dense | none | 41.7% | 45.8% | 31.3% | 5046 |
| a4.b1.c3 | 400/80 + header | BGE-base | hybrid RRF60, 1:1 | none | 41.7% | 42.3% | 26.7% | 5111 |
| a4.b3.c3 | 400/80 + header | Nomic | hybrid RRF60, 1:1 | none | 41.7% | 45.6% | 31.3% | 5620 |
| a2.b3.c3 | 400/80 | Nomic | hybrid RRF60, 1:1 | none | 41.7% | 46.7% | 34.6% | 5955 |
| a3.b1.c2 | 800/150 | BGE-base | BM25 | none | 38.3% | 40.5% | 28.9% | 9329 |
| a3.b2.c2 | 800/150 | BGE-M3 | BM25 | none | 38.3% | 40.5% | 28.9% | 9329 |
| a3.b3.c2 | 800/150 | Nomic | BM25 | none | 38.3% | 40.5% | 28.9% | 9329 |
| a3.b4.c2 | 800/150 | Qwen3-embedding 0.6B | BM25 | none | 38.3% | 40.5% | 28.9% | 9329 |
| a4.b1.c1 | 400/80 + header | BGE-base | dense | none | 36.7% | 36.9% | 28.3% | 3435 |