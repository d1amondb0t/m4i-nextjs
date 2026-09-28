/**
 * Renders the calibration results as a single readable Markdown report.
 *
 *   node calibration/report.mjs
 *
 * Reads every stage output under calibration/results/ and writes report.md.
 * Kept separate from the harness so the report can be regenerated without
 * re-running the pipeline.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RESULTS = join(dirname(fileURLToPath(import.meta.url)), "results");

const percent = (value) => `${(value * 100).toFixed(1)}%`;
const load = async (name) => JSON.parse(await readFile(join(RESULTS, name), "utf8"));

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

const thresholds = await load("thresholds.json");
const rejection = await load("rejection.json");
const recommendation = await load("recommended-configuration.json");
const bounds = await load("adaptive-k-bounds.json");
const { separation, grid } = await load("sweep.json");

const { recommended, basis, decisions, adaptiveK, precision, chunksPerQuestion } = recommendation;

const acceptCurve = grid
  .filter((row) => row.maximumFalseRejectRate === 0.1)
  .map((row) => [
    percent(row.maximumFalseAcceptRate),
    row.acceptThreshold.toFixed(6),
    `${row.decisions.accept}/${thresholds.questions}`,
    percent(row.precision),
  ]);

const rejectCurve = rejection.fits.map((fit) => [
  percent(fit.maximumFalseRejectRate),
  fit.threshold.toFixed(6),
  `${fit.inScopeRejected}/${rejection.inScopeQuestions} (${percent(fit.falseRejectRate)})`,
  `${fit.outOfScopeRejected}/${rejection.outOfScopeQuestions} (${percent(fit.outOfScopeRejectionRate)})`,
]);

const boundsRows = bounds.variants.map((variant) => [
  variant.minimumK,
  variant.relativeDropoff,
  variant.meanK.toFixed(2),
  percent(variant.precision),
  variant.relevantPerQuestion.toFixed(2),
  percent(variant.recall),
]);

const dimensionRows = thresholds.perDimension.map((dimension) => [
  dimension.dimensionId,
  dimension.questions,
  dimension.accept.threshold.toFixed(6),
  percent(dimension.accept.observedRate),
  percent(dimension.relevantObservations / dimension.observations),
]);

const report = `# Retrieval calibration results

Generated ${recommendation.generatedAt}.

## Setup

| | |
|---|---|
| Documents indexed | ${thresholds.corpus.documents} |
| Chunks indexed | ${thresholds.corpus.chunks.toLocaleString("en-US")} |
| Documents that failed extraction | ${thresholds.corpus.failures} |
| In-scope questions (ontology) | ${thresholds.questions} |
| Out-of-scope questions (negatives) | ${rejection.outOfScopeQuestions} |
| Candidates reranked per question | ${thresholds.candidatesPerQuestion} |
| Labelled chunk observations | ${thresholds.global.observations.toLocaleString("en-US")} |
| Judged relevant | ${thresholds.global.relevantObservations.toLocaleString("en-US")} (${percent(separation.relevantShare)}) |

Scores are \`ms-marco-MiniLM-L6-v2\` cross-encoder scores, sigmoid-normalised to (0, 1).
Labels come from a \`qwen3.5:9b\` relevance judge.

## How separable are the scores?

This governs everything below.

| Score | AUC |
|---|---|
| Cross-encoder reranker | **${separation.rerankerAuc.toFixed(3)}** |
| Dense cosine (pre-rerank) | ${separation.denseAuc.toFixed(3)} |

AUC is the probability a randomly chosen relevant chunk outranks a randomly chosen
irrelevant one; 0.5 is a coin flip. Reranking helps, but ${separation.rerankerAuc.toFixed(3)} is weak.
Chunk precision therefore plateaus in the 50–60% band against a ${percent(separation.relevantShare)} base rate
at *every* threshold — so no threshold makes automatic acceptance genuinely safe here.

## Accept threshold

Fitted to a target false-accept rate: the share of accepted chunks that are irrelevant.
The fit takes the lowest threshold meeting the target, which admits the most evidence.

${table(["Target false accepts", "Threshold", "Questions accepting", "Precision"], acceptCurve)}

A target of 30% or tighter is only reachable at 0.99, which accepts one chunk across the
whole question set. **${recommended.acceptThreshold.toFixed(6)}** (40% target) is the tightest
setting that still admits usable volume.

## Reject threshold

The in-scope set contains no negatives — all ${thresholds.questions} ontology questions find at least
one relevant chunk — so the reject threshold cannot be fitted from it. It is fitted instead
against ${rejection.outOfScopeQuestions} deliberately out-of-scope questions, on each question's *top* score, which is
the granularity the reject decision is actually made at.

Median top score: **${rejection.inScopeTopScoreMedian.toFixed(5)}** in scope versus
**${rejection.outOfScopeTopScoreMedian.toFixed(5)}** out of scope — a far cleaner separation than the
chunk-level signal.

${table(["Target false rejects", "Threshold", "In-scope wrongly rejected", "Out-of-scope caught"], rejectCurve)}

## Adaptive k

Bounds chosen from the trade-off below. Baseline is fixed k = ${bounds.baseline.k}
(precision ${percent(bounds.baseline.precision)}, ${bounds.baseline.relevantPerQuestion.toFixed(2)} relevant chunks per question).

${table(["minK", "drop-off", "mean k", "precision", "relevant/q", "recall"], boundsRows)}

\`minK = ${recommended.minimumK}, drop-off = ${recommended.relativeDropoff}\` is the only row that beats fixed k on all three
axes at once. Tighter drop-offs buy precision by discarding relevant evidence: the reranker
scores are heavy-tailed near zero, so a relative cut collapses k to 1.

## Recommended configuration

\`\`\`ts
{
  acceptThreshold: ${recommended.acceptThreshold},
  rejectThreshold: ${recommended.rejectThreshold},
  minimumK: ${recommended.minimumK},
  maximumK: ${recommended.maximumK},
  relativeDropoff: ${recommended.relativeDropoff},
}
\`\`\`

| | |
|---|---|
| Accepted chunks that are irrelevant | ${percent(basis.acceptFalseAcceptRate)} |
| In-scope questions wrongly rejected | ${percent(basis.rejectFalseRejectRate)} |
| Out-of-scope questions caught | ${percent(basis.rejectOutOfScopeRejectionRate)} |
| Decisions | accept ${decisions.accept}, ambiguous ${decisions.ambiguous}, reject ${decisions.reject} |
| Adaptive k | mean ${adaptiveK.mean.toFixed(2)}, range ${adaptiveK.min}–${adaptiveK.max} |

${table(
  ["Metric", `Fixed k = ${bounds.baseline.k}`, "Adaptive k"],
  [
    ["Mean precision", percent(precision.fixedK), `**${percent(precision.adaptive)}**`],
    [
      "Mean chunks per question",
      chunksPerQuestion.fixedK.toFixed(2),
      `**${chunksPerQuestion.adaptive.toFixed(2)}**`,
    ],
  ],
)}

## Per impact dimension

Accept thresholds fitted independently per dimension, to show whether one global value is
defensible.

${table(
  ["Dimension", "Questions", "Accept threshold", "False accepts", "Relevant share"],
  dimensionRows,
)}

## Caveats

- Labels come from \`qwen3.5:9b\`, the same model family the pipeline generates with, so the
  judge is not independent of the system under test.
- The accept threshold is conditioned on the top-${thresholds.candidatesPerQuestion} reranked pool, which is where it is
  applied. It does not describe the full corpus.
- ${thresholds.corpus.documents} documents is a sample. \`docs/calibration-corpus-sources.md\` targets 1,000+ per topic;
  re-run \`calibration/download-corpus.mjs\` with a larger \`--per-topic\` before treating any of
  this as production values.
- The out-of-scope negatives are synthetic. They establish that the corpus can be told apart
  from unrelated subject matter; they do not measure in-scope questions the corpus happens to
  answer badly.
`;

await writeFile(join(RESULTS, "report.md"), report);
process.stdout.write(`Wrote ${join(RESULTS, "report.md")}\n`);
