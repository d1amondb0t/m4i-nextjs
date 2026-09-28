# Retrieval calibration results

Generated 2026-09-08T16:21:18.983Z.

## Setup

| | |
|---|---|
| Documents indexed | 109 |
| Chunks indexed | 7,861 |
| Documents that failed extraction | 1 |
| In-scope questions (ontology) | 84 |
| Out-of-scope questions (negatives) | 24 |
| Candidates reranked per question | 20 |
| Labelled chunk observations | 1,680 |
| Judged relevant | 658 (39.2%) |

Scores are `ms-marco-MiniLM-L6-v2` cross-encoder scores, sigmoid-normalised to (0, 1).
Labels come from a `qwen3.5:9b` relevance judge.

## How separable are the scores?

This governs everything below.

| Score | AUC |
|---|---|
| Cross-encoder reranker | **0.616** |
| Dense cosine (pre-rerank) | 0.571 |

AUC is the probability a randomly chosen relevant chunk outranks a randomly chosen
irrelevant one; 0.5 is a coin flip. Reranking helps, but 0.616 is weak.
Chunk precision therefore plateaus in the 50–60% band against a 39.2% base rate
at *every* threshold — so no threshold makes automatic acceptance genuinely safe here.

## Accept threshold

Fitted to a target false-accept rate: the share of accepted chunks that are irrelevant.
The fit takes the lowest threshold meeting the target, which admits the most evidence.

| Target false accepts | Threshold | Questions accepting | Precision |
|---|---|---|---|
| 5.0% | 0.990289 | 1/84 | 54.7% |
| 10.0% | 0.990289 | 1/84 | 54.7% |
| 20.0% | 0.990289 | 1/84 | 54.7% |
| 30.0% | 0.990289 | 1/84 | 54.7% |
| 40.0% | 0.167277 | 25/84 | 55.7% |
| 50.0% | 0.001196 | 75/84 | 54.7% |

A target of 30% or tighter is only reachable at 0.99, which accepts one chunk across the
whole question set. **0.167277** (40% target) is the tightest
setting that still admits usable volume.

## Reject threshold

The in-scope set contains no negatives — all 84 ontology questions find at least
one relevant chunk — so the reject threshold cannot be fitted from it. It is fitted instead
against 24 deliberately out-of-scope questions, on each question's *top* score, which is
the granularity the reject decision is actually made at.

Median top score: **0.04093** in scope versus
**0.00013** out of scope — a far cleaner separation than the
chunk-level signal.

| Target false rejects | Threshold | In-scope wrongly rejected | Out-of-scope caught |
|---|---|---|---|
| 1.0% | 0.000132 | 0/84 (0.0%) | 12/24 (50.0%) |
| 2.0% | 0.000173 | 1/84 (1.2%) | 14/24 (58.3%) |
| 5.0% | 0.000407 | 4/84 (4.8%) | 19/24 (79.2%) |
| 10.0% | 0.001106 | 8/84 (9.5%) | 21/24 (87.5%) |
| 20.0% | 0.003544 | 16/84 (19.0%) | 21/24 (87.5%) |

## Adaptive k

Bounds chosen from the trade-off below. Baseline is fixed k = 5
(precision 42.6%, 2.13 relevant chunks per question).

| minK | drop-off | mean k | precision | relevant/q | recall |
|---|---|---|---|---|---|
| 1 | 0.01 | 4.12 | 50.9% | 1.86 | 24.2% |
| 1 | 0.05 | 3.20 | 53.4% | 1.52 | 20.8% |
| 1 | 0.1 | 2.76 | 55.7% | 1.37 | 19.0% |
| 1 | 0.25 | 2.12 | 58.8% | 1.13 | 16.0% |
| 1 | 0.5 | 1.57 | 57.4% | 0.83 | 12.6% |
| 2 | 0.01 | 4.35 | 42.8% | 1.89 | 24.7% |
| 2 | 0.05 | 3.45 | 44.6% | 1.56 | 21.3% |
| 2 | 0.1 | 3.06 | 45.7% | 1.42 | 19.6% |
| 2 | 0.25 | 2.52 | 46.3% | 1.20 | 16.9% |
| 2 | 0.5 | 2.15 | 44.9% | 0.98 | 14.3% |
| 3 | 0.01 | 4.73 | 45.3% | 2.13 | 27.6% |
| 3 | 0.05 | 3.90 | 46.9% | 1.82 | 24.5% |
| 3 | 0.1 | 3.61 | 48.0% | 1.73 | 23.4% |
| 3 | 0.25 | 3.19 | 48.0% | 1.55 | 21.6% |
| 3 | 0.5 | 2.99 | 47.0% | 1.40 | 20.1% |
| 5 | 0.01 | 5.75 | 42.8% | 2.50 | 31.6% |
| 5 | 0.05 | 5.17 | 43.0% | 2.24 | 28.9% |
| 5 | 0.1 | 5.02 | 43.4% | 2.19 | 28.5% |
| 5 | 0.25 | 4.88 | 43.6% | 2.13 | 27.9% |
| 5 | 0.5 | 4.85 | 43.6% | 2.12 | 27.6% |

`minK = 3, drop-off = 0.01` is the only row that beats fixed k on all three
axes at once. Tighter drop-offs buy precision by discarding relevant evidence: the reranker
scores are heavy-tailed near zero, so a relative cut collapses k to 1.

## Recommended configuration

```ts
{
  acceptThreshold: 0.1672767128527276,
  rejectThreshold: 0.000407202442728089,
  minimumK: 3,
  maximumK: 12,
  relativeDropoff: 0.01,
}
```

| | |
|---|---|
| Accepted chunks that are irrelevant | 39.7% |
| In-scope questions wrongly rejected | 4.8% |
| Out-of-scope questions caught | 79.2% |
| Decisions | accept 25, ambiguous 55, reject 4 |
| Adaptive k | mean 4.96, range 3–12 |

| Metric | Fixed k = 5 | Adaptive k |
|---|---|---|
| Mean precision | 42.6% | **45.3%** |
| Mean chunks per question | 5.00 | **4.73** |

## Per impact dimension

Accept thresholds fitted independently per dimension, to show whether one global value is
defensible.

| Dimension | Questions | Accept threshold | False accepts | Relevant share |
|---|---|---|---|---|
| political | 12 | 0.003463 | 39.1% | 39.2% |
| economic | 12 | 0.002174 | 39.4% | 43.3% |
| social | 12 | 0.892660 | 0.0% | 42.9% |
| environmental | 12 | 0.000550 | 39.8% | 40.0% |
| urban_transport | 12 | 0.908214 | 100.0% | 28.7% |
| humanitarian_rights | 12 | 0.091085 | 40.0% | 38.8% |
| education | 12 | 0.990289 | 0.0% | 41.3% |

## Caveats

- Labels come from `qwen3.5:9b`, the same model family the pipeline generates with, so the
  judge is not independent of the system under test.
- The accept threshold is conditioned on the top-20 reranked pool, which is where it is
  applied. It does not describe the full corpus.
- 109 documents is a sample. `docs/calibration-corpus-sources.md` targets 1,000+ per topic;
  re-run `calibration/download-corpus.mjs` with a larger `--per-topic` before treating any of
  this as production values.
- The out-of-scope negatives are synthetic. They establish that the corpus can be told apart
  from unrelated subject matter; they do not measure in-scope questions the corpus happens to
  answer badly.
