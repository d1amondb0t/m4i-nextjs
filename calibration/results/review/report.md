# RAG verification and follow-up results

Generated 2026-09-09T13:20:14.258Z from completed local runs on 9 September 2026.

## Decision

Keep exploring Qwen embeddings and hybrid retrieval. The most promising cheap
change is to weight dense retrieval more strongly: on the plain 400-word index,
category-separated tuning increased P@5 from 62.1%
to 64.8% and nDCG@10 from
60.2% to 62.3%.
This is preliminary evidence on a previously explored corpus, not a production
promotion or a fresh-test result.

The claimed adaptive-k dominance does not hold consistently after separating
parameter selection from evaluation. Simple ontology expansion trades top-five
precision against ranking quality; replacing the original lexical query hurts.
Aggressive source filtering loses useful evidence.

I fixed the missing Ollama client in both application pipeline constructors,
added regression coverage, and corrected misleading explanatory comments.
Retrieval model and threshold values remain the branch's existing experimental
defaults. Adaptive selection is still an experiment, not wired into the app.

## What ran

- Recomputed every one of the original 48 first-stage configurations. Maximum
  nDCG discrepancy: **0.0000000000**.
- Seven tuning studies: 15 fusion settings on each of three indexes; six
  score/rank blends on two pools; nine filtering strategies; 90 adaptive
  settings plus fixed-five fallback. Every question is evaluated once outside
  its category's tuning fold.
- Three query-level recall-risk targets: 5%, 10%, 20%.
- Four live ontology-query arms, with **586 new local Qwen relevance
  judgments**, 21 new BM25 category queries, and all 84 questions evaluated.
- Re-evaluated seven rerankers under both judges on the same 504
  previously judged passages.

The source corpus has 109 documents, 84 questions, 21 categories and seven
dimensions. Each outer fold holds out three complete categories (12 questions)
and selects settings on the other 72. This prevents sibling questions from
crossing a tuning/evaluation boundary. Source documents are shared across folds.

## Ranking results

Each row compares the same chunking, candidate inputs and relevance denominator.
Intervals are paired category-bootstrap 95% intervals in percentage points,
2,000 replicates; they are exploratory and unadjusted for multiple comparisons.
They do not quantify annotation bias or uncertainty from prior model selection.

| Experiment | P@5 baseline → tuned | nDCG@10 baseline → tuned | Δ nDCG, pp [95% interval] |
|---|---|---|---|
| 400w, Qwen, tune dense/BM25 fusion | 62.1% → 64.8% | 60.2% → 62.3% | +2.10 [+0.07, +4.25] |
| 800w, Qwen, tune dense/BM25 fusion | 66.4% → 67.9% | 63.5% → 65.2% | +1.72 [+0.04, +3.52] |
| 400w + header, tune fusion | 61.7% → 63.8% | 62.2% → 61.3% | -0.94 [-3.06, +1.06] |
| 800w, blend Qwen rating + retrieval rank | 70.2% → 72.6% | 66.9% → 67.2% | +0.32 [-1.60, +2.21] |
| 400w + header, blend rating + retrieval rank | 71.2% → 72.4% | 68.3% → 68.7% | +0.42 [-1.19, +2.05] |

The 800-word fusion study selected dense:BM25 = **3:1**, RRF k=60 in all seven
folds. The plain 400-word study selected 3:1 too, with k=60 in six folds and k=30
in one. Blend gains have intervals crossing zero. Header-index fusion did not
improve nDCG consistently; do not assume the same setting wins everywhere.

For fusion controls, baseline RRF is reconstructed from the same saved dense and
sparse legs as each alternative. One question's ordering in each index differs
from the independently saved historical hybrid pool. This small cache discrepancy
is recorded in offline.json; no cause is assumed. The separate historical
arithmetic check uses the original pools unchanged.

## Live ontology ablation

The extra lexical query uses the category name and inclusion vocabulary. It does
not receive the question's expected answer or judgments. All labels are against
the original question, and all four arms use the same enlarged judged pool.

| Configuration | P@5 | nDCG@10 | Pooled R@20 | Δ nDCG, pp [95% interval] |
|---|---|---|---|---|
| original-rrf60 | 61.7% | 62.2% | 33.8% | +0.00 [+0.00, +0.00] |
| ontology-add-0.25 | 64.8% | 61.4% | 34.0% | -0.79 [-2.96, +1.40] |
| ontology-add-0.5 | 64.5% | 61.3% | 34.0% | -0.82 [-3.02, +1.38] |
| ontology-replace-sparse | 58.6% | 55.6% | 31.8% | -6.58 [-10.72, -2.61] |

Adding a small ontology leg raises P@5, but nDCG drops slightly and recall barely
changes. Replacing question-specific BM25 with the broad category query loses
6.58 pp nDCG. Selecting the arm on training-fold nDCG chooses the original query
in all seven folds; its cross-validated change is zero. This rejects that simple
replacement strategy, not structured ontology or graph retrieval in general.

Local inference used qwen3.5:9b-q4_K_M, explicit 16,384-token context, temperature 0,
seed 20260909, full passages and batches of four. Incomplete verdicts are retried
and failing batches split, never defaulted to false. The completed cache records
3 invalid responses; an earlier interrupted attempt also rejected a batch
before response logging was added. Recorded successful-batch judging time is
279.6 seconds; this excludes some interrupted retries and orchestration.
BM25 calls added 0.094 seconds total on this local index.
These are cache-backed timings, not a production p95 benchmark.

## Selection and recall control

Precision here is the relevant share of the returned set, averaged over all
questions with rejected questions counted as zero. Conditional precision omits
rejections and is shown explicitly. Evidence volume uses all returned chunks.

| Method | Precision, all queries | Precision, answered | Relevant/query | Chunks/query | Words/query | Answered |
|---|---|---|---|---|---|---|
| Fixed k=5 | 71.2% | 71.2% | 3.56 | 5.00 | 1434 | 100.0% |
| Category-separated adaptive tuning | 72.8% | 73.7% | 3.86 | 5.10 | 1494 | 98.8% |
| Historical defaults, descriptive only | 75.6% | 76.5% | 4.05 | 5.18 | 1536 | 98.8% |

The tuned precision change is **+1.64 [-2.32, +5.44] pp**. The relevant
evidence change is 0.30 chunks/query
[-0.18, 0.88], and
mean returned size increases rather than staying below five. The old 76.5% versus
68.1% claim selected settings on its evaluation split and omitted abstentions
from adaptive precision. It is not confirmed as an across-the-board improvement.
Standard P@5 also falls to 61.9% because short returned lists
leave empty slots; this is distinct from returned-set precision above.

Query-level conformal risk control selected threshold **0 in every fold** at all
three targets, returning all 20 candidates. Observed candidate-pool recall loss
was zero, at 51.4% returned-set precision and about 6,048 words/query. It therefore
offers no useful filtering at those targets on these cached scores.

There are **167 relevant-labeled passages scored zero out of 864 relevant
passages** in the a4 pointwise pool. Dropping zeros loses 22.1% of relevant evidence
when averaged per question. We cannot distinguish true model disagreement,
truncation and missing-rating fallback from the saved scores alone. No corpus
recall or answer-correctness guarantee follows from this experiment.

## Filtering and judge sensitivity

The following fixed filtering arms are descriptive ablations. Training-fold
selection among them produces no P@5 improvement over no filtering.

| Filter before top five | P@5 | Unique relevant source pages/query | Words/query |
|---|---|---|---|
| none | 71.2% | 3.35 | 1434 |
| page | 70.7% | 3.54 | 1435 |
| source:1 | 58.6% | 2.93 | 1441 |
| source:2 | 66.4% | 3.24 | 1467 |
| source:3 | 68.1% | 3.30 | 1433 |
| front-matter | 71.4% | 3.36 | 1434 |
| mmr:0.7 | 70.5% | 3.40 | 1418 |
| mmr:0.85 | 70.7% | 3.38 | 1415 |
| mmr:0.95 | 70.7% | 3.38 | 1415 |

One-per-page is a reasonable diversity tradeoff to investigate further; a page
is not a unique fact. One-per-document is too aggressive on this corpus.

The next table uses the exact same six-item subpool per question under both
judges. Its nDCG is not comparable to the full-pool tables above.

| Reranker | Qwen-label nDCG@10 | Gemma-label nDCG@10 |
|---|---|---|
| No reranker | 87.0% | 83.9% |
| MiniLM | 81.4% | 80.7% |
| BGE reranker | 82.2% | 80.1% |
| Jina turbo | 82.3% | 79.2% |
| Mixedbread xsmall | 86.2% | 84.7% |
| Qwen listwise | 85.7% | 85.0% |
| Qwen pointwise | 86.7% | 84.4% |

Model ordering changes with the judge. This supports requiring independent
adjudication, not declaring one model the truth. The historical agreement is
69.4%, kappa .381. Twenty-four easy out-of-scope questions with 24 rejections do
not establish universal rejection: the descriptive Wilson 95% lower bound is
about 86.2%, before considering distribution shift or selection.

## Reproduce and inspect

Run from the repository root:

```powershell
node calibration/review/common.test.mjs
node calibration/review/offline.mjs
node calibration/review/live-ontology.mjs
node calibration/review/report.mjs
npm test
npx tsc --noEmit
```

The offline run needs the existing ignored chunk/pool/scored/judge caches. The
live run also needs the local a4 Qwen Qdrant index and Ollama model. It only
queries the existing index and writes review artifacts; no index is rebuilt.
Content-bearing inference caches remain ignored by Git. Compact per-query
metrics, chosen fold settings and input/model fingerprints are saved alongside
this report in offline.json and live-ontology.json.

Validation: **273 application tests and seven experiment-helper tests passed**;
TypeScript checking passed. New tests cover actual default pipeline wiring,
category separation, metric denominators, CRC loss and parity with production
adaptive selection. Tests do not validate relevance labels or answer quality.

Read [the research and review](../../../docs/rag-research-review.md) for cited
literature, ontology writing guidance, remaining implementation risks and the
specified next experiment tranche. [The protocol](../../review/PLAN.md) records
the configurations chosen before the new results were inspected.
