# Retrieval-depth experiment — 9 September 2026

Interpret larger retrieval sizes as larger k, following the recall discussion.
Also include both existing 400- and 800-word chunk indexes; do not rebuild them.

## Fixed design (before results)

- First two questions in each of the 21 ontology categories: 42 questions,
  six per dimension. All settings use this same subset.
- Five first-stage configurations:
  1. BGE-base dense, 400/80 words.
  2. Qwen3-embedding 0.6B, dense, 400/80 plus provenance header.
  3. Qwen, hybrid RRF60 1:1, 400/80 plus header.
  4. Qwen, hybrid RRF60 dense:BM25=3:1, 400/80 without header.
  5. Qwen, hybrid RRF60 dense:BM25=3:1, 800/150 without header.
- Retrieve 80 candidates per search leg once. Evaluate nested prefixes at
  output k=5/10/20/40/80. This isolates output depth: top-five precision and
  nDCG@10 cannot change once their cutoff is reached on the same ranking.
- Separately compare RRF leg depths 20/40/80 to detect top-ranking changes
  from a larger retrieval pool.
- Fresh pointwise Qwen3.5 9B reranking on configuration 3: score the maximum
  pool once, then rerank nested candidate pools of 20/40/80 and evaluate
  output k=5/10/20/40/80 where k does not exceed candidate depth. Show the
  same 220-word passage prefix, batch size 4, 16K context, seed and rubric.
- Query-level conformal recall-risk control at alpha=.05/.1/.2 on each scored
  pool, using seven category-separated folds (36 calibration, six evaluation
  queries per fold). No top-k cap after conformal filtering.

## Measurement and controls

- Judge newly retrieved passages using the original Qwen relevance rubric.
  Full-body judging, explicit 16K context, strict complete response validation,
  retries and batch splitting. Unknown labels never become negative.
- Reuse old judgments and matching completed live-review judgments. Preserve
  all original caches; save new model/input fingerprints and per-query metrics.
- Fix one enlarged relevance denominator per question and chunk partition
  BEFORE comparing k values. Count unique chunk IDs, including the original
  pooled candidates and every new candidate entering these experiments.
  Use a common 400-word denominator for a2/a4 only if stripped bodies and IDs
  match exactly. Recall is judged-pool recall, not exhaustive corpus/fact recall.
- Report precision@k, recall@k, relevant chunks, unique relevant source pages,
  words, P@5, nDCG@10 and incremental relevant yield. Report paired category
  bootstrap intervals for differences. Dimension results are six-query pilots.
- Bigger k on a fixed ranking must have nondecreasing recall. Quality beyond
  retrieval (answer accuracy, hallucinations) is not measured in this tranche.
- Original labels used default model context and old scores allowed missing
  responses to become zero. New reranker scores are validated and freshly
  generated; compare depths within this run rather than attributing differences
  from earlier scores solely to candidate depth.

No parameter search or per-dimension winner is promoted to application defaults.

## Corpus validation note

The 400-word plain/header indexes have the same 4,659 IDs and evidence bodies.
Nine headers contain a closing bracket in their document title, which defeats
the older first-closing-bracket stripping expression. The depth runner verifies
each header against the corresponding plain chunk and uses that known body
for judging. New labels cover any corrected bodies absent from the old cache.
