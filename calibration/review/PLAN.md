# RAG review experiment protocol — 2026-09-09

Freeze this plan before reading new experiment results. This is an exploratory
extension of an already-used benchmark, not a fresh final test set.

## Evaluation

- Use all 84 existing questions. Keep the four questions of each of the 21
  categories together in seven deterministic outer folds. Select settings on
  the other categories only; record every fold's selected setting.
- Compare identical chunking and identical pooled relevance denominators.
  Unknown labels are errors, never implicit negatives. Retain original caches.
- Report P@5 with denominator 5, nDCG@10, pooled recall@20, relevant chunks,
  unique relevant source pages, returned words, and abstention-aware precision.
- Paired 95% bootstrap intervals resample categories (2,000 replicates).
  These intervals describe benchmark sampling, not judge accuracy or the
  uncertainty introduced by the earlier selection of models and this corpus.
- Primary labels remain the existing Qwen labels. Independently inspect the
  existing 504 Gemma judgments using the identical six-item subpools for every
  reranker. Do not call this full-pool independent evaluation.

## Experiments

1. Replay dense/sparse fusion on the existing Qwen indexes: RRF constants
   10/30/60 and dense weights 0/.25/.5/.75/1. Keep depth 20 for each leg.
2. Blend pointwise scores with original retrieval rank: original-rank weights
   0/.1/.25/.5/.75/1. Evaluate separately on a3 and a4 pools.
3. Filter cached a4 pointwise results: none, same-page duplicate removal,
   source cap 1/2/3, obvious front-matter demotion, and token-Jaccard MMR with
   relevance weights .7/.85/.95. Include unfiltered baseline in tuning.
4. Selection: fixed k=5, historical defaults, category-separated adaptive
   tuning (accept .5/.6/.7/.8/.9, minimum 1/3, maximum 5/8/12, relative
   dropoff .01/.75/.9), and per-question conformal risk control at recall
   loss targets .05/.1/.2. CRC retains uncapped sets and only controls loss
   relative to retrieved candidate pools under exchangeability assumptions.
5. Live ontology query ablation, a4 Qwen index: original dense+BM25; add a
   separate BM25 query of the category name and inclusion vocabulary with
   weights .25/.5; replace the original BM25 query with that ontology query.
   Retrieve 20 per leg, fuse with RRF60, keep 20. Judge new passages against
   the original question with the original rubric, without ontology hints.
   Recalculate every arm against the same enlarged pool. Explicitly request
   16K model context and validate all returned verdicts. This isolates a cheap
   ontology vocabulary ablation; it does not implement OG-RAG's hypergraph.

No new embedding models or indexes are needed. All live work uses local
services. No production defaults are promoted from these exploratory results.

## Research motivation

- [Conformal Risk Control](https://arxiv.org/abs/2208.02814): calibrate a
  bounded, monotone query-level recall loss instead of treating correlated
  chunks or a question's top score as evidence-retention guarantees.
- [OG-RAG](https://aclanthology.org/2025.emnlp-main.1674/): represent entities,
  typed relations and provenance; a category tree alone is not that method.
- [Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval):
  meaningful chunk-specific context differs from document/page headers.
- [Lost in the Middle](https://aclanthology.org/2024.tacl-1.9/): measure actual
  context cost and evidence visibility rather than assuming larger is better.
