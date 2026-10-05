/**
 * Renders the retrieval experiment results as Markdown.
 *
 *   node calibration/experiment-report.mjs
 *
 * Reads every stage output under calibration/results/experiment/ and writes
 * experiment-report.md there.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RESULTS = join(dirname(fileURLToPath(import.meta.url)), "results", "experiment");

const percent = (value) => `${(value * 100).toFixed(1)}%`;
const load = async (name) => JSON.parse(await readFile(join(RESULTS, name), "utf8"));

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

const judgments = Object.keys(await load("judge-cache.json")).length;
const stage1 = await load("stage1-metrics.json");
const stage2 = await load("stage2-metrics.json");
const stage4 = await load("stage4-judge-agreement.json");
const stage5 = await load("stage5-operating-point.json");

const baseline = stage1.rows.find((row) => row.id === "a1.b1.c1");
const best1 = stage1.rows[0];

function marginal(key) {
  const groups = {};
  for (const row of stage1.rows) (groups[row[key]] ??= []).push(row);

  return Object.entries(groups)
    .map(([id, rows]) => ({
      id,
      label: rows[0][`${key}Label`],
      ndcg: mean(rows.map((row) => row.ndcgAt10)),
      p5: mean(rows.map((row) => row.precisionAt5)),
    }))
    .sort((a, b) => b.ndcg - a.ndcg);
}

const winner = stage5.report[0];
const bestPoolRows = stage2.rows.filter((row) => row.pool === "a3.b4.c3");
const baselinePoolRows = stage2.rows.filter((row) => row.pool === "a1.b1.c1");
const byReranker = (rows) =>
  rows
    .sort((a, b) => b.ndcgAt10 - a.ndcgAt10)
    .map((row) => [
      row.rerankerLabel,
      percent(row.ndcgAt10),
      percent(row.precisionAt5),
      Number.isNaN(row.auc) ? "n/a" : row.auc.toFixed(3),
    ]);

const report = `# Retrieval experiment results

Generated ${stage5.generatedAt}.

82 configurations over five axes, on 109 documents and the 84 questions in
\`calibration/ontology.json\`, scored against one shared pool of
${judgments.toLocaleString("en-US")} relevance judgments.

## Headline

${table(
  ["", "nDCG@10", "P@5", "R@20", "MRR"],
  [
    [
      "baseline \`a1.b1.c1\` (200w, bge-base, dense)",
      percent(baseline.ndcgAt10),
      percent(baseline.precisionAt5),
      percent(baseline.recallAt20),
      baseline.mrr.toFixed(3),
    ],
    [
      `best first stage \`${best1.id}\``,
      `**${percent(best1.ndcgAt10)}**`,
      `**${percent(best1.precisionAt5)}**`,
      `**${percent(best1.recallAt20)}**`,
      `**${best1.mrr.toFixed(3)}**`,
    ],
  ],
)}

That gain is first-stage retrieval alone, with no reranker.

## Which axis mattered

Marginal mean nDCG@10, averaged over every setting of the other axes.

${["embedding", "retrieval", "chunking"]
  .map((key) =>
    [
      `### ${key}`,
      "",
      table(
        ["Variant", "nDCG@10", "P@5"],
        marginal(key).map((entry) => [entry.label, percent(entry.ndcg), percent(entry.p5)]),
      ),
    ].join("\n"),
  )
  .join("\n\n")}

The embedding model moved retrieval further than everything else combined. BM25
alone matching dense is what makes fusion worth it: the two fail on different
questions.

## Reranking

Rerankers were applied to already-judged pools, so all 28 runs cost no new labels.

### On the strongest pool (\`a3.b4.c3\`)

${table(["Reranker", "nDCG@10", "P@5", "AUC"], byReranker(bestPoolRows))}

### On the baseline pool (\`a1.b1.c1\`)

${table(["Reranker", "nDCG@10", "P@5", "AUC"], byReranker(baselinePoolRows))}

The two tables tell opposite stories, and that is the finding: cross-encoders
**rescue a weak pool and damage a strong one**. They substitute for retrieval
quality rather than adding to it. Only the pointwise LLM rating improves both.

## Why the LLM rating is the one that can carry a threshold

Cross-encoder precision plateaus at every threshold. The pointwise rating does
not — precision rises monotonically with it, which is the property threshold
calibration needs and the property the original ms-marco score lacked.

## Operating point

Fitted on ${winner.splitSizes.calibration} calibration questions, measured on
${winner.splitSizes.evaluation} held-out ones.

${table(
  ["", "precision", "relevant/question", "chunks/question"],
  [
    [
      "fixed k=5",
      percent(winner.fixedK.precision),
      winner.fixedK.relevantPerQuestion.toFixed(2),
      "5.00",
    ],
    [
      "adaptive k",
      `**${percent(winner.best.precision)}**`,
      `**${winner.best.relevantPerQuestion.toFixed(2)}**`,
      `**${winner.best.meanK.toFixed(2)}**`,
    ],
  ],
)}

${winner.dominatingSettings} of the swept settings beat fixed k on all three axes
at once. Rejection catches ${winner.outOfScope.caught === null ? "n/a" : percent(winner.outOfScope.caught)} of
out-of-scope questions.

\`\`\`ts
// types/retrieval-types.ts
{ acceptThreshold: 0.7, rejectThreshold: 0.6, minimumK: 1, maximumK: 8, relativeDropoff: 0.01 }
\`\`\`

## Judge reliability

${table(
  ["", ""],
  [
    ["Pairs compared", stage4.pairs],
    ["Primary judge", `\`${stage4.primaryModel}\``],
    ["Second judge", `\`${stage4.secondaryModel}\``],
    ["Primary says relevant", percent(stage4.primaryRelevantRate)],
    ["Second says relevant", percent(stage4.secondaryRelevantRate)],
    ["Raw agreement", percent(stage4.observed)],
    ["Cohen's kappa", stage4.kappa.toFixed(3)],
  ],
)}

Kappa ${stage4.kappa.toFixed(2)} is only "fair". Two consequences: measured AUC
understates true discrimination, because a third of the labels are contested;
and differences of one or two points anywhere above are inside label noise and
should not be read as real. The large effects — the embedding model, the
cross-encoder harm, the adaptive-k gain — are well outside it.

## Caveats

- Labels come from \`${stage4.primaryModel}\`, which is also the model behind the two
  LLM reranker rows. Those rows are the ones most at risk of flattery; the
  agreement check above is the evidence that the bias is not total, not proof
  that it is absent.
- Stage 1 and stage 2 nDCG use different denominators — the pooled union across
  all 12 configurations in stage 1, the single pool in stage 2 — so compare
  within a stage, never across.
- The context-header chunking variant is a cheap stand-in for Contextual
  Retrieval, not the method itself. Its effect was inside noise, so that axis is
  untested rather than refuted.
- 109 documents is a sample. Re-run \`calibration/download-corpus.mjs\` with a
  larger \`--per-topic\` before treating any of this as settled.
`;

await writeFile(join(RESULTS, "experiment-report.md"), report);
process.stdout.write(`Wrote ${join(RESULTS, "experiment-report.md")}\n`);
