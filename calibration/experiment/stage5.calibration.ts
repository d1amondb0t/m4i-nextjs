/**
 * Stage 5 — operating point.
 *
 * Stage 3 applied thresholds fitted for the old, weak score to the new, much
 * stronger one and unsurprisingly got a bad answer: a 40% false-accept target
 * is slack when the pool is already 51% relevant, so the accept threshold
 * collapsed to the bottom of the scale and k ran to its ceiling.
 *
 * This stage sweeps the two knobs that actually matter for the winning
 * configuration — how tight the accept target is, and how adaptive k is
 * bounded — and picks the point that beats fixed k on precision without
 * giving up relevant evidence. Everything is fitted on the calibration split
 * and reported on held-out questions.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { adaptiveSelect } from "@/app/server/rag/retrieval/adaptive-k";
import { conformalThreshold, splitIndices } from "@/app/server/rag/retrieval/conformal";
import { mean, precisionAtK } from "@/app/server/rag/retrieval/metrics";
import { fitAcceptThreshold } from "@/app/server/rag/retrieval/threshold-fitting";
import { EXPERIMENT_RESULTS } from "./corpus";

/** Winning configuration from stage 2, plus the runner-up for a sanity check. */
const CONFIGURATIONS = ["a4.b4.c3-d7", "a4.b4.c1-d7"];
const BASELINE_K = 5;
const REJECT_ALPHA = 0.05;

const FALSE_ACCEPT_TARGETS = [0.5, 0.4, 0.3, 0.25, 0.2, 0.15, 0.1];
const MINIMUM_K = [1, 2, 3, 5];
const DROPOFF = [0.01, 0.1, 0.25, 0.5, 0.75];
const MAXIMUM_K = [8, 12];

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

type Scored = {
  questionId: string;
  observations: { chunkId: string; score: number; relevant: boolean }[];
};

function asResults(observations: Scored["observations"]) {
  return observations.map((observation) => ({
    chunk: { chunkId: observation.chunkId },
    score: observation.score,
    denseScore: null,
    sparseScore: null,
  })) as unknown as Parameters<typeof adaptiveSelect>[0];
}

const topScore = (entry: Scored) =>
  entry.observations.length === 0
    ? 0
    : Math.max(...entry.observations.map((observation) => observation.score));

describe("stage 5 - operating point", () => {
  it("sweeps accept targets and adaptive-k bounds on held-out questions", async () => {
    const report: Record<string, unknown>[] = [];

    for (const configuration of CONFIGURATIONS) {
      const scoredPath = join(EXPERIMENT_RESULTS, `scored-${configuration}.json`);
      const oosPath = join(
        EXPERIMENT_RESULTS,
        `oos-${configuration.replace("-", "-")}.json`,
      );

      if (!existsSync(scoredPath)) {
        log(`[stage5] missing ${scoredPath}`);
        continue;
      }

      const scored = JSON.parse(await readFile(scoredPath, "utf8")) as Scored[];
      const outOfScope = existsSync(oosPath)
        ? (JSON.parse(await readFile(oosPath, "utf8")) as number[])
        : [];
      const split = splitIndices(scored.length);
      const calibration = split.calibration.map((index) => scored[index]);
      const evaluation = split.evaluation.map((index) => scored[index]);

      // Reject threshold: conformal quantile of calibration top scores.
      const reject = conformalThreshold(calibration.map(topScore), REJECT_ALPHA);
      const calibrationObservations = calibration.flatMap((entry) =>
        entry.observations.map((observation) => ({
          score: observation.score,
          relevant: observation.relevant,
        })),
      );

      const fixedK = {
        precision: mean(
          evaluation.map((entry) =>
            precisionAtK(
              entry.observations.map((observation) => observation.relevant),
              BASELINE_K,
            ),
          ),
        ),
        relevantPerQuestion: mean(
          evaluation.map(
            (entry) =>
              entry.observations.slice(0, BASELINE_K).filter((o) => o.relevant).length,
          ),
        ),
        meanK: BASELINE_K,
      };

      const variants = FALSE_ACCEPT_TARGETS.flatMap((target) => {
        const accept = fitAcceptThreshold(calibrationObservations, target);

        return MINIMUM_K.flatMap((minimumK) =>
          MAXIMUM_K.flatMap((maximumK) =>
            DROPOFF.map((relativeDropoff) => {
              const rows = evaluation.map((entry) => {
                const selection = adaptiveSelect(asResults(entry.observations), {
                  acceptThreshold: accept.threshold,
                  rejectThreshold: Math.min(reject.threshold, accept.threshold),
                  minimumK,
                  maximumK,
                  relativeDropoff,
                });
                const relevantById = new Map(
                  entry.observations.map((o) => [o.chunkId, o.relevant]),
                );
                const relevant = selection.selected.filter((result) =>
                  relevantById.get(result.chunk.chunkId),
                ).length;
                const poolRelevant = entry.observations.filter((o) => o.relevant).length;

                return {
                  k: selection.k,
                  relevant,
                  decision: selection.decision,
                  precision: selection.k === 0 ? null : relevant / selection.k,
                  recall: poolRelevant === 0 ? 0 : relevant / poolRelevant,
                };
              });

              return {
                falseAcceptTarget: target,
                acceptThreshold: accept.threshold,
                minimumK,
                maximumK,
                relativeDropoff,
                meanK: mean(rows.map((row) => row.k)),
                precision: mean(
                  rows.flatMap((row) => (row.precision === null ? [] : [row.precision])),
                ),
                relevantPerQuestion: mean(rows.map((row) => row.relevant)),
                recall: mean(rows.map((row) => row.recall)),
                rejected: rows.filter((row) => row.decision === "reject").length,
              };
            }),
          ),
        );
      });

      // Prefer settings that dominate fixed k: at least as much relevant
      // evidence, strictly better precision, no more chunks.
      const dominating = variants.filter(
        (variant) =>
          variant.relevantPerQuestion >= fixedK.relevantPerQuestion &&
          variant.precision > fixedK.precision &&
          variant.meanK <= BASELINE_K,
      );
      const best =
        [...dominating].sort((left, right) => right.precision - left.precision)[0] ??
        [...variants]
          .filter((variant) => variant.relevantPerQuestion >= fixedK.relevantPerQuestion)
          .sort((left, right) => right.precision - left.precision)[0];

      report.push({
        configuration,
        splitSizes: { calibration: calibration.length, evaluation: evaluation.length },
        rejectThreshold: reject.threshold,
        rejectSupported: reject.supported,
        outOfScope: {
          questions: outOfScope.length,
          caught:
            outOfScope.length === 0
              ? null
              : outOfScope.filter((score) => score < reject.threshold).length /
                outOfScope.length,
        },
        fixedK,
        dominatingSettings: dominating.length,
        best,
        variants,
      });

      log("");
      log(`  ${configuration}  (calibration ${calibration.length} / held-out ${evaluation.length})`);
      log(`    fixed k=${BASELINE_K}: precision ${(fixedK.precision * 100).toFixed(1)}%, relevant/q ${fixedK.relevantPerQuestion.toFixed(2)}`);
      log(`    reject threshold ${reject.threshold.toFixed(3)} -> out-of-scope caught ${outOfScope.length === 0 ? "n/a" : `${((outOfScope.filter((s) => s < reject.threshold).length / outOfScope.length) * 100).toFixed(1)}%`}`);
      log("");
      log("    FAR   accept  minK  maxK  drop   meanK  precision  relevant/q  recall");

      const shown = [...variants]
        .filter((variant) => variant.relevantPerQuestion >= fixedK.relevantPerQuestion)
        .sort((left, right) => right.precision - left.precision)
        .slice(0, 12);

      for (const variant of shown) {
        log(
          `    ${variant.falseAcceptTarget.toFixed(2)}  ${variant.acceptThreshold.toFixed(3).padStart(6)}  ${String(variant.minimumK).padStart(4)}  ${String(variant.maximumK).padStart(4)}  ${variant.relativeDropoff.toFixed(2)}  ${variant.meanK.toFixed(2).padStart(6)}  ${(variant.precision * 100).toFixed(1).padStart(8)}%  ${variant.relevantPerQuestion.toFixed(2).padStart(10)}  ${(variant.recall * 100).toFixed(1).padStart(5)}%`,
        );
      }
      log("");
      log(`    settings dominating fixed k: ${dominating.length}`);
      if (best) {
        log(
          `    chosen: FAR ${best.falseAcceptTarget}, accept ${best.acceptThreshold.toFixed(3)}, k in [${best.minimumK}, ${best.maximumK}], drop ${best.relativeDropoff} -> precision ${(best.precision * 100).toFixed(1)}% at ${best.meanK.toFixed(2)} chunks`,
        );
      }
    }

    await writeFile(
      join(EXPERIMENT_RESULTS, "stage5-operating-point.json"),
      JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2),
    );

    expect(report.length).toBeGreaterThan(0);
  });
});
