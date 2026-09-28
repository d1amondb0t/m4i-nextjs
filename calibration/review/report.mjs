import { readFileSync, writeFileSync } from 'node:fs';
import { OUT } from './common.mjs';

const offline = JSON.parse(readFileSync(OUT + 'offline.json', 'utf8'));
const live = JSON.parse(readFileSync(OUT + 'live-ontology.json', 'utf8'));
const pct = value => (100 * value).toFixed(1) + '%';
const pp = value => (value >= 0 ? '+' : '') + (100 * value).toFixed(2);
const ci = change => `${pp(change.delta)} [${pp(change.lower)}, ${pp(change.upper)}]`;
const get = id => offline.families.find(f => f.id === id);
const names = {
  'fusion-a2': '400w, Qwen, tune dense/BM25 fusion',
  'fusion-a3': '800w, Qwen, tune dense/BM25 fusion',
  'fusion-a4': '400w + header, tune fusion',
  'blend-a3': '800w, blend Qwen rating + retrieval rank',
  'blend-a4': '400w + header, blend rating + retrieval rank',
};
const rankingRows = Object.entries(names).map(([id, name]) => {
  const f = get(id);
  return `| ${name} | ${pct(f.baseline.p5)} → ${pct(f.crossValidated.p5)} | ${pct(f.baseline.ndcg10)} → ${pct(f.crossValidated.ndcg10)} | ${ci(f.changes.ndcg10)} |`;
}).join('\n');
const ontologyRows = live.variants.map(v => `| ${v.id} | ${pct(v.summary.p5)} | ${pct(v.summary.ndcg10)} | ${pct(v.summary.recall20)} | ${ci(v.ndcgDelta)} |`).join('\n');
const a = get('adaptive-a4');
const selectionRow = (name, s) => `| ${name} | ${pct(s.precision)} | ${pct(s.conditionalPrecision)} | ${s.relevant.toFixed(2)} | ${s.count.toFixed(2)} | ${s.words.toFixed(0)} | ${pct(s.coverage)} |`;
const filters = get('filter-a4').descriptiveVariants.map(v => `| ${v.id} | ${pct(v.summary.p5)} | ${v.summary.uniqueRelevantPages.toFixed(2)} | ${v.summary.words.toFixed(0)} |`).join('\n');
const judgeRows = Array.from({ length: 7 }, (_, i) => {
  const id = 'd' + (i + 1), rows = offline.judgeSensitivity.rows.filter(r => r.reranker === id);
  const names = ['No reranker', 'MiniLM', 'BGE reranker', 'Jina turbo', 'Mixedbread xsmall', 'Qwen listwise', 'Qwen pointwise'];
  return `| ${names[i]} | ${pct(rows.find(r => r.judge === 'primary').summary.ndcg10)} | ${pct(rows.find(r => r.judge === 'secondary').summary.ndcg10)} |`;
}).join('\n');

const report = `# RAG verification and follow-up results

Generated ${new Date().toISOString()} from completed local runs on 9 September 2026.

## Decision

Keep exploring Qwen embeddings and hybrid retrieval. The most promising cheap
change is to weight dense retrieval more strongly: on the plain 400-word index,
category-separated tuning increased P@5 from ${pct(get('fusion-a2').baseline.p5)}
to ${pct(get('fusion-a2').crossValidated.p5)} and nDCG@10 from
${pct(get('fusion-a2').baseline.ndcg10)} to ${pct(get('fusion-a2').crossValidated.ndcg10)}.
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
  nDCG discrepancy: **${Math.max(...offline.audit.stage1.map(r => Math.abs(r.savedNdcg - r.recomputedNdcg))).toFixed(10)}**.
- Seven tuning studies: 15 fusion settings on each of three indexes; six
  score/rank blends on two pools; nine filtering strategies; 90 adaptive
  settings plus fixed-five fallback. Every question is evaluated once outside
  its category's tuning fold.
- Three query-level recall-risk targets: 5%, 10%, 20%.
- Four live ontology-query arms, with **${live.newJudgments} new local Qwen relevance
  judgments**, 21 new BM25 category queries, and all 84 questions evaluated.
- Re-evaluated seven rerankers under both judges on the same ${offline.judgeSensitivity.passages}
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
${rankingRows}

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
${ontologyRows}

Adding a small ontology leg raises P@5, but nDCG drops slightly and recall barely
changes. Replacing question-specific BM25 with the broad category query loses
6.58 pp nDCG. Selecting the arm on training-fold nDCG chooses the original query
in all seven folds; its cross-validated change is zero. This rejects that simple
replacement strategy, not structured ontology or graph retrieval in general.

Local inference used ${live.model}, explicit 16,384-token context, temperature 0,
seed 20260909, full passages and batches of four. Incomplete verdicts are retried
and failing batches split, never defaulted to false. The completed cache records
${live.invalidResponsesRetried} invalid responses; an earlier interrupted attempt also rejected a batch
before response logging was added. Recorded successful-batch judging time is
${(live.timing.judgeMs / 1000).toFixed(1)} seconds; this excludes some interrupted retries and orchestration.
BM25 calls added ${(live.timing.retrievalMs / 1000).toFixed(3)} seconds total on this local index.
These are cache-backed timings, not a production p95 benchmark.

## Selection and recall control

Precision here is the relevant share of the returned set, averaged over all
questions with rejected questions counted as zero. Conditional precision omits
rejections and is shown explicitly. Evidence volume uses all returned chunks.

| Method | Precision, all queries | Precision, answered | Relevant/query | Chunks/query | Words/query | Answered |
|---|---|---|---|---|---|---|
${selectionRow('Fixed k=5', a.baseline)}
${selectionRow('Category-separated adaptive tuning', a.crossValidated)}
${selectionRow('Historical defaults, descriptive only', offline.historicalDefaults.summary)}

The tuned precision change is **${ci(a.changes.precision)} pp**. The relevant
evidence change is ${a.changes.relevant.delta.toFixed(2)} chunks/query
[${a.changes.relevant.lower.toFixed(2)}, ${a.changes.relevant.upper.toFixed(2)}], and
mean returned size increases rather than staying below five. The old 76.5% versus
68.1% claim selected settings on its evaluation split and omitted abstentions
from adaptive precision. It is not confirmed as an across-the-board improvement.
Standard P@5 also falls to ${pct(a.crossValidated.p5)} because short returned lists
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
${filters}

One-per-page is a reasonable diversity tradeoff to investigate further; a page
is not a unique fact. One-per-document is too aggressive on this corpus.

The next table uses the exact same six-item subpool per question under both
judges. Its nDCG is not comparable to the full-pool tables above.

| Reranker | Qwen-label nDCG@10 | Gemma-label nDCG@10 |
|---|---|---|
${judgeRows}

Model ordering changes with the judge. This supports requiring independent
adjudication, not declaring one model the truth. The historical agreement is
69.4%, kappa .381. Twenty-four easy out-of-scope questions with 24 rejections do
not establish universal rejection: the descriptive Wilson 95% lower bound is
about 86.2%, before considering distribution shift or selection.

## Reproduce and inspect

Run from the repository root:

\`\`\`powershell
node calibration/review/common.test.mjs
node calibration/review/offline.mjs
node calibration/review/live-ontology.mjs
node calibration/review/report.mjs
npm test
npx tsc --noEmit
\`\`\`

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
`;
writeFileSync(OUT + 'report.md', report);
console.log(OUT + 'report.md');
