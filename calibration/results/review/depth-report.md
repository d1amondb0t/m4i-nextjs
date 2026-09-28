# Larger retrieval pools: local experiment results

Generated 2026-09-09T16:37:31.395Z.

## Answer to the experiment question

Increasing output k recovers more relevant chunks, but the useful comparison is the additional evidence versus precision and context cost. These runs separate output depth from candidate-pool depth. All 42 questions are paired across settings: two questions per category, six per ontology dimension. Aggregate rates are unweighted means over questions; evidence counts and context sizes are also per-query means.

At k=40, the highest pooled recall among the comparable 400-word configurations is **qwen-400-weighted** (32.1% recall, 53.2% precision). At k=80 it is **qwen-400-weighted** (56.8% recall, 47.7% precision). The 800-word condition has its own relevance universe, so its recall is not ranked against the 400-word conditions.

### Practical interpretation of this run

- **Evidence collection:** larger output sets help materially. Weighted Qwen with 400-word chunks is the strongest tested 400-word retrieval option at k=40/80. Choose 80 when coverage warrants the additional passages; it has no demonstrated recall plateau by rank 80, but precision declines.
- **Small top-five answers:** retain the 20-candidate reranking baseline when compute matters. Forty candidates has the best observed P@5 and nDCG@10, but its gain over 20 is uncertain; 80 does not improve top-five quality in this sample. Forty is a reasonable next operating point when retaining 10–20 passages, where it recovers more relevant evidence after reranking. This reranker comparison uses the header hybrid 1:1 configuration, not the weighted retrieval configuration.
- **Chunk length:** the 800-word setting gives only a small observed precision advantage over weighted 400-word retrieval, with substantially more context words. Its higher pooled recall percentage cannot establish superiority because the relevance units and denominator differ.
- **Conformal filtering:** 5% and 10% recall-loss targets retain every candidate at all three depths. A 20% target permits filtering, with observed candidate recall losses of 13.8–16.4%, but still leaves about 15/29/53 chunks at pool sizes 20/40/80. Enlarging the pool does not resolve the strict-target filtering limitation.
- **Ontology variation:** at a 40-candidate reranking depth, social P@5 rises from 80.0% to 96.7%, while humanitarian/law/rights falls from 86.7% to 73.3%. These six-question dimension samples do not support one universal winner or tuned per-dimension defaults.

## Returning more chunks: fixed rankings

Each cell is **precision@k / recall@k**, with configurations ordered by precision@40. Every ranking is obtained with 80 candidates per retrieval leg; output prefixes are nested. This isolates the effect of returning more results. Context sizes count evidence-body words; prompts and provenance headers add overhead.

| Configuration | k=20 P/R | k=40 P/R | k=80 P/R | Relevant/query, 20 → 80 | Words/query, 20 → 80 |
|---|---|---|---|---|---|
| Qwen hybrid 3:1, 800/150 | 60.2% / 26.1% | 54.7% / 46.6% | 47.8% / 79.5% | 12.05 → 38.21 | 8292 → 29277 |
| Qwen hybrid 3:1, 400/80 | 58.8% / 18.0% | 53.2% / 32.1% | 47.7% / 56.8% | 11.76 → 38.17 | 5882 → 21810 |
| Qwen dense, 400/80 + header | 55.2% / 16.9% | 51.0% / 30.5% | 46.4% / 54.8% | 11.05 → 37.10 | 5571 → 21777 |
| Qwen hybrid 1:1, 400/80 + header | 55.5% / 17.3% | 51.0% / 31.3% | 43.4% / 51.8% | 11.10 → 34.69 | 6319 → 24324 |
| BGE-base dense, 400/80 | 39.2% / 11.7% | 39.4% / 23.3% | 36.6% / 43.3% | 7.83 → 29.31 | 5507 → 21782 |

The 400/80 and 800/150 settings specify maximum chunk words / overlap words. Chunks remain within pages, so doubling the maximum does not double the typical passage length.

| Chunk setting | Corpus chunks | Mean body words | Median body words | Maximum body words |
|---|---|---|---|---|
| 400/80 | 4659 | 257.9 | 266 | 400 |
| 800/150 | 3325 | 332.6 | 322 | 800 |

The strongest effect is not necessarily the largest recall percentage: inspect the number of new relevant chunks, new source pages and extra words as well. The following intervals resample 21 categories (2,000 paired bootstrap draws); they describe this exploratory sample, not annotation accuracy or a fresh-test population.

| Configuration | Δ recall 20 → 80, pp [95% interval] | Δ precision 20 → 80, pp [95% interval] | Relevant fraction in added ranks 21–40 | Relevant fraction in added ranks 41–80 |
|---|---|---|---|---|
| BGE-base dense, 400/80 | +31.6 [+28.4, +35.0] | -2.5 [-4.3, -0.7] | 39.6% | 33.9% |
| Qwen dense, 400/80 + header | +37.9 [+35.1, +40.8] | -8.9 [-12.4, -5.5] | 46.7% | 41.8% |
| Qwen hybrid 1:1, 400/80 + header | +34.6 [+32.4, +36.8] | -12.1 [-14.5, -9.7] | 46.4% | 35.8% |
| Qwen hybrid 3:1, 400/80 | +38.7 [+35.3, +41.6] | -11.1 [-14.0, -8.5] | 47.5% | 42.3% |
| Qwen hybrid 3:1, 800/150 | +53.4 [+49.3, +56.6] | -12.5 [-15.1, -10.0] | 49.2% | 40.8% |

## Searching deeper before reranking

Fresh Qwen3.5 9B pointwise scores are shared across nested candidate pools of 20, 40 and 80 from the 400-word header hybrid configuration. Ratings use 220 words per passage, batches of four, temperature zero, seed 20260909 and explicit 16K context. Missing or malformed ratings are retried rather than converted to zero.

| Candidates scored | Returned k | P@k | R@k | P@5 | nDCG@10 on returned list | Relevant/query | Words/query |
|---|---|---|---|---|---|---|---|
| 20 | 5 | 81.4% | 6.7% | 81.4% | 53.7% | 4.07 | 1571 |
| 20 | 10 | 70.0% | 11.1% | 81.4% | 74.4% | 7.00 | 3127 |
| 20 | 20 | 55.5% | 17.3% | 81.4% | 74.4% | 11.10 | 6319 |
| 40 | 5 | 82.4% | 6.8% | 82.4% | 53.6% | 4.12 | 1528 |
| 40 | 10 | 75.0% | 12.0% | 82.4% | 77.3% | 7.50 | 3097 |
| 40 | 20 | 66.0% | 20.7% | 82.4% | 77.3% | 13.19 | 6254 |
| 40 | 40 | 51.0% | 31.3% | 82.4% | 77.3% | 20.38 | 12526 |
| 80 | 5 | 81.0% | 6.7% | 81.0% | 51.8% | 4.05 | 1503 |
| 80 | 10 | 76.2% | 12.3% | 81.0% | 77.0% | 7.62 | 2997 |
| 80 | 20 | 68.7% | 21.5% | 81.0% | 77.0% | 13.74 | 6124 |
| 80 | 40 | 59.5% | 36.4% | 81.0% | 77.0% | 23.79 | 12181 |
| 80 | 80 | 43.4% | 51.8% | 81.0% | 77.0% | 34.69 | 24324 |

| Candidate-depth comparison | Δ P@5, pp [95% interval] | Δ nDCG@10 at output 10, pp [95% interval] |
|---|---|---|
| 20 → 40 candidates | +1.0 [-4.3, +7.1] | +2.9 [-0.5, +6.4] |
| 20 → 80 candidates | -0.5 [-6.2, +6.2] | +2.6 [-0.9, +6.3] |
| 40 → 80 candidates | -1.4 [-4.3, +1.4] | -0.3 [-2.9, +2.4] |

| Candidates reranked | Δ P@5 versus the same hybrid ranking without reranking, pp [95% interval] |
|---|---|
| 20 | +17.1 [+10.0, +24.3] |
| 40 | +18.1 [+10.0, +26.2] |
| 80 | +16.7 [+8.6, +24.3] |

| Ontology dimension | P@5, 20 candidates | P@5, 40 candidates | P@5, 80 candidates |
|---|---|---|---|
| Political & governance | 73.3% | 86.7% | 83.3% |
| Economy & finance | 83.3% | 76.7% | 73.3% |
| Social impact | 80.0% | 96.7% | 96.7% |
| Environment & climate | 86.7% | 90.0% | 90.0% |
| Urban structures & transport | 70.0% | 63.3% | 70.0% |
| Humanitarian concerns, law & rights | 86.7% | 73.3% | 70.0% |
| Education | 90.0% | 90.0% | 83.3% |

Output-five nDCG@10 above is intentionally based on only the five returned items; compare candidate sizes at the same output k. Increasing candidate depth can improve or harm top-five quality because reranking changes membership. Increasing only output k on one fixed list cannot change P@5, or nDCG@10 once k is at least ten.

## Enlarging the RRF search legs

This comparison changes the depth of the dense/BM25 legs before fusion, while always returning 20. It is separate from the fixed-ranking output-depth curves.

| Configuration | Candidates per leg | P@5 | Δ P@5 from leg depth 20, pp [95% interval] | nDCG@10 | P@20 | R@20 |
|---|---|---|---|---|---|---|
| qwen-400h-hybrid | 20 | 64.8% | — | 66.0% | 53.8% | 16.7% |
| qwen-400h-hybrid | 40 | 65.2% | +0.5 [-5.2, +5.7] | 64.2% | 55.0% | 17.0% |
| qwen-400h-hybrid | 80 | 64.3% | -0.5 [-7.1, +5.2] | 63.7% | 55.5% | 17.3% |
| qwen-400-weighted | 20 | 69.5% | — | 65.9% | 56.1% | 17.2% |
| qwen-400-weighted | 40 | 65.7% | -3.8 [-7.6, 0.0] | 65.2% | 57.1% | 17.5% |
| qwen-400-weighted | 80 | 64.3% | -5.2 [-9.5, -1.4] | 64.2% | 58.8% | 18.0% |
| qwen-800-weighted | 20 | 71.9% | — | 68.9% | 58.6% | 25.4% |
| qwen-800-weighted | 40 | 70.5% | -1.4 [-7.1, +3.8] | 68.0% | 59.3% | 25.7% |
| qwen-800-weighted | 80 | 71.4% | -0.5 [-6.2, +4.8] | 68.0% | 60.2% | 26.1% |

## Conformal recall control on the larger pools

Each fold calibrates on 36 questions and evaluates six questions from three disjoint categories. The query-level loss is the fraction of relevant candidates dropped; there is no top-k cap after filtering. Thresholds vary by fold. This is candidate-pool recall control under exchangeability assumptions, not corpus recall or answer factuality certification.

| Candidate pool | Target recall loss | Thresholds selected | Observed candidate recall loss | Returned-set precision | Mean returned | Words/query |
|---|---|---|---|---|---|---|
| 20 | 5.0% | 0 | 0.0% | 55.5% | 20.00 | 6319 |
| 20 | 10.0% | 0 | 0.0% | 55.5% | 20.00 | 6319 |
| 20 | 20.0% | 0.2 | 13.8% | 65.7% | 15.02 | 4750 |
| 40 | 5.0% | 0 | 0.0% | 51.0% | 40.00 | 12526 |
| 40 | 10.0% | 0 | 0.0% | 51.0% | 40.00 | 12526 |
| 40 | 20.0% | 0.2 | 15.2% | 61.7% | 28.62 | 8987 |
| 80 | 5.0% | 0 | 0.0% | 43.4% | 80.00 | 24324 |
| 80 | 10.0% | 0 | 0.0% | 43.4% | 80.00 | 24324 |
| 80 | 20.0% | 0.2, 0.1 | 16.4% | 55.8% | 52.86 | 16234 |

## Every depth and ontology dimension

Dimension results are exploratory six-question samples. Recall denominators are fixed across depths and across the verified equivalent 400-word partitions.

### BGE-base dense, 400/80

| k | P@k | R@k | Relevant/query | Unique relevant pages/query | Words/query |
|---|---|---|---|---|---|
| 5 | 41.4% | 3.4% | 2.07 | 1.98 | 1371 |
| 10 | 39.3% | 6.2% | 3.93 | 3.60 | 2703 |
| 20 | 39.2% | 11.7% | 7.83 | 7.24 | 5507 |
| 40 | 39.4% | 23.3% | 15.76 | 14.40 | 11094 |
| 80 | 36.6% | 43.3% | 29.31 | 26.07 | 21782 |

| Dimension | k=20 P/R | k=40 P/R | k=80 P/R | Relevant/query, 20 → 80 |
|---|---|---|---|---|
| Political & governance | 40.0% / 8.9% | 37.9% / 17.3% | 36.3% / 32.7% | 8.00 → 29.00 |
| Economy & finance | 44.2% / 12.1% | 45.4% / 24.3% | 39.4% / 42.5% | 8.83 → 31.50 |
| Social impact | 43.3% / 13.4% | 42.1% / 24.9% | 40.6% / 47.6% | 8.67 → 32.50 |
| Environment & climate | 43.3% / 14.0% | 42.5% / 27.6% | 40.2% / 51.9% | 8.67 → 32.17 |
| Urban structures & transport | 20.0% / 9.5% | 20.4% / 17.7% | 21.9% / 38.3% | 4.00 → 17.50 |
| Humanitarian concerns, law & rights | 44.2% / 10.3% | 45.0% / 21.2% | 41.9% / 38.2% | 8.83 → 33.50 |
| Education | 39.2% / 13.8% | 42.5% / 30.2% | 36.3% / 52.0% | 7.83 → 29.00 |

### Qwen dense, 400/80 + header

| k | P@k | R@k | Relevant/query | Unique relevant pages/query | Words/query |
|---|---|---|---|---|---|
| 5 | 65.7% | 5.2% | 3.29 | 3.05 | 1375 |
| 10 | 59.3% | 9.3% | 5.93 | 5.43 | 2723 |
| 20 | 55.2% | 16.9% | 11.05 | 10.07 | 5571 |
| 40 | 51.0% | 30.5% | 20.38 | 17.86 | 10902 |
| 80 | 46.4% | 54.8% | 37.10 | 32.17 | 21777 |

| Dimension | k=20 P/R | k=40 P/R | k=80 P/R | Relevant/query, 20 → 80 |
|---|---|---|---|---|
| Political & governance | 63.3% / 15.7% | 59.6% / 30.1% | 53.1% / 52.7% | 12.67 → 42.50 |
| Economy & finance | 64.2% / 17.8% | 61.3% / 33.5% | 56.7% / 62.2% | 12.83 → 45.33 |
| Social impact | 51.7% / 14.4% | 47.9% / 26.8% | 48.5% / 56.0% | 10.33 → 38.83 |
| Environment & climate | 63.3% / 20.8% | 55.4% / 36.4% | 44.4% / 56.6% | 12.67 → 35.50 |
| Urban structures & transport | 41.7% / 17.5% | 32.9% / 26.7% | 30.6% / 47.5% | 8.33 → 24.50 |
| Humanitarian concerns, law & rights | 54.2% / 14.9% | 52.5% / 26.8% | 47.9% / 47.7% | 10.83 → 38.33 |
| Education | 48.3% / 17.1% | 47.1% / 33.1% | 43.3% / 60.9% | 9.67 → 34.67 |

### Qwen hybrid 1:1, 400/80 + header

| k | P@k | R@k | Relevant/query | Unique relevant pages/query | Words/query |
|---|---|---|---|---|---|
| 5 | 64.3% | 5.0% | 3.21 | 2.93 | 1587 |
| 10 | 59.3% | 9.3% | 5.93 | 5.36 | 3134 |
| 20 | 55.5% | 17.3% | 11.10 | 9.98 | 6319 |
| 40 | 51.0% | 31.3% | 20.38 | 17.93 | 12526 |
| 80 | 43.4% | 51.8% | 34.69 | 29.95 | 24324 |

| Dimension | k=20 P/R | k=40 P/R | k=80 P/R | Relevant/query, 20 → 80 |
|---|---|---|---|---|
| Political & governance | 52.5% / 12.8% | 52.9% / 25.4% | 48.5% / 46.8% | 10.50 → 38.83 |
| Economy & finance | 62.5% / 17.4% | 60.4% / 34.1% | 52.1% / 57.9% | 12.50 → 41.67 |
| Social impact | 58.3% / 16.2% | 52.1% / 30.4% | 44.4% / 51.1% | 11.67 → 35.50 |
| Environment & climate | 62.5% / 21.1% | 56.7% / 37.6% | 46.0% / 60.3% | 12.50 → 36.83 |
| Urban structures & transport | 39.2% / 17.7% | 35.4% / 30.6% | 27.9% / 46.9% | 7.83 → 22.33 |
| Humanitarian concerns, law & rights | 58.3% / 15.7% | 52.9% / 28.0% | 47.3% / 47.2% | 11.67 → 37.83 |
| Education | 55.0% / 19.8% | 46.3% / 33.1% | 37.3% / 52.6% | 11.00 → 29.83 |

### Qwen hybrid 3:1, 400/80

| k | P@k | R@k | Relevant/query | Unique relevant pages/query | Words/query |
|---|---|---|---|---|---|
| 5 | 64.3% | 5.2% | 3.21 | 2.95 | 1483 |
| 10 | 62.4% | 9.6% | 6.24 | 5.83 | 2938 |
| 20 | 58.8% | 18.0% | 11.76 | 10.67 | 5882 |
| 40 | 53.2% | 32.1% | 21.26 | 18.71 | 11341 |
| 80 | 47.7% | 56.8% | 38.17 | 33.57 | 21810 |

| Dimension | k=20 P/R | k=40 P/R | k=80 P/R | Relevant/query, 20 → 80 |
|---|---|---|---|---|
| Political & governance | 61.7% / 15.4% | 57.9% / 28.9% | 53.3% / 53.7% | 12.33 → 42.67 |
| Economy & finance | 71.7% / 20.2% | 62.9% / 35.1% | 57.7% / 63.3% | 14.33 → 46.17 |
| Social impact | 57.5% / 16.5% | 52.1% / 30.3% | 48.8% / 57.0% | 11.50 → 39.00 |
| Environment & climate | 69.2% / 22.9% | 57.1% / 37.8% | 47.7% / 62.0% | 13.83 → 38.17 |
| Urban structures & transport | 42.5% / 17.1% | 36.3% / 27.9% | 30.2% / 45.2% | 8.50 → 24.17 |
| Humanitarian concerns, law & rights | 55.8% / 15.0% | 54.2% / 28.2% | 50.8% / 52.3% | 11.17 → 40.67 |
| Education | 53.3% / 19.1% | 51.7% / 36.8% | 45.4% / 63.9% | 10.67 → 36.33 |

### Qwen hybrid 3:1, 800/150

| k | P@k | R@k | Relevant/query | Unique relevant pages/query | Words/query |
|---|---|---|---|---|---|
| 5 | 71.4% | 8.4% | 3.57 | 3.48 | 2220 |
| 10 | 65.7% | 14.7% | 6.57 | 6.43 | 4305 |
| 20 | 60.2% | 26.1% | 12.05 | 11.79 | 8292 |
| 40 | 54.7% | 46.6% | 21.88 | 21.38 | 15964 |
| 80 | 47.8% | 79.5% | 38.21 | 37.17 | 29277 |

| Dimension | k=20 P/R | k=40 P/R | k=80 P/R | Relevant/query, 20 → 80 |
|---|---|---|---|---|
| Political & governance | 62.5% / 22.7% | 57.9% / 41.9% | 52.7% / 75.0% | 12.50 → 42.17 |
| Economy & finance | 77.5% / 28.5% | 70.4% / 51.3% | 60.0% / 86.3% | 15.50 → 48.00 |
| Social impact | 65.0% / 26.3% | 57.1% / 45.3% | 52.9% / 82.8% | 13.00 → 42.33 |
| Environment & climate | 65.0% / 29.9% | 59.6% / 54.6% | 45.0% / 81.3% | 13.00 → 36.00 |
| Urban structures & transport | 40.0% / 24.0% | 34.2% / 40.3% | 31.0% / 67.6% | 8.00 → 24.83 |
| Humanitarian concerns, law & rights | 60.0% / 25.7% | 54.2% / 44.5% | 48.8% / 77.7% | 12.00 → 39.00 |
| Education | 51.7% / 25.4% | 49.6% / 48.4% | 44.0% / 85.5% | 10.33 → 35.17 |

## What these results do and do not mean

- Recall uses a fixed union of previously pooled and newly retrieved chunk IDs. It does not count every relevant fact in the corpus. The denominator has expanded since earlier reports, so old and new recall percentages are not directly comparable.
- The 400-word plain/header indexes have identical chunk IDs and evidence bodies. A previous header parser left suffix text on nine chunks whose titles contain a closing bracket; this run recovers the verified original bodies before judging. Retrieval vectors are unchanged.
- Primary judgments and reranker scores are both Qwen-generated. Old labels used older context defaults; new labels use explicit 16K context. Same-model preference, disputed labels and reuse of these questions limit conclusions. No answer generation or human factuality evaluation ran.
- The application defaults to a **1,200-word generation context**. Returning 40 or 80 chunks alone will not expose all that evidence to generation. Deeper retrieval followed by selective reranking is the relevant comparison for that budget.
- All search legs were fetched once at depth 80 and sliced. Real ANN queries issued separately with different limits can return different rankings. RRF depth effects are evaluated explicitly above.
- Larger chunks also mean larger contexts and different relevance units. This run reuses 400/800-word indexes; it does not establish an optimal chunk size or re-test every embedder/reranker.

## Provenance and reproduction

4999 new relevance judgments; 3360 fresh validated pointwise ratings; 0 invalid responses retried. Model digests, index information, question IDs, fixed denominators, per-query results and all fold thresholds are in depth-results.json. Content-bearing caches remain ignored by Git.

| Stage | Recorded local seconds | Calls |
|---|---|---|
| embed | 6.5 | 12 |
| retrieve | 8.2 | 294 |
| judge | 2278.0 | 1268 |
| rating | 1523.8 | 840 |

Times include recorded inference attempts and exclude some file I/O and orchestration. Scores are shared across candidate-depth conditions, so the experiment avoids paying for repeated identical ratings. Production latency at each candidate depth has not been benchmarked separately.

```powershell
node calibration/review/depth-metrics.test.mjs
node calibration/review/depth-run.mjs
node calibration/review/depth-report.mjs
```

The runner resumes completed local work from a fingerprinted cache. See [the pre-run plan](../../review/DEPTH-PLAN.md). No application defaults or vector indexes were changed.
