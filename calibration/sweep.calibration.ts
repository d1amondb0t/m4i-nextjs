/**
 * Diagnostics over the labelled retrieval scores produced by
 * calibrate.calibration.ts.
 *
 * Answers two questions the single fitted result cannot:
 *   1. How well does each score actually separate relevant from irrelevant?
 *   2. What thresholds, bands and adaptive-k follow from other error targets?
 *
 * Reads calibration/results/labels.json, writes calibration/results/sweep.json.
 * Cheap and read-only: no Ollama or Qdrant calls.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { adaptiveSelect } from "@/app/server/rag/retrieval/adaptive-k";
import {
  fitThresholds,
  type LabelledScore,
} from "@/app/server/rag/retrieval/threshold-fitting";
import type { SearchResult } from "@/app/server/rag/storage/storage-types";
import { DEFAULT_RETRIEVAL_CONFIGURATION } from "@/types/retrieval-types";

const RESULTS = join(dirname(fileURLToPath(import.meta.url)), "results");

const FALSE_ACCEPT_TARGETS = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5];
const FALSE_REJECT_TARGETS = [0.05, 0.1, 0.2, 0.3, 0.4];
const BOUNDS = { minimumK: 1, maximumK: 12, relativeDropoff: 0.5 };
const BASELINE_K = DEFAULT_RETRIEVAL_CONFIGURATION.topK;

type LabelledChunk = {
  chunkId: string;
  score: number;
  denseScore: number | null;
  relevant: boolean;
};
type QuestionLabels = { questionId: string; retrieved: LabelledChunk[] };

/**
 * Probability that a randomly chosen relevant chunk outranks a randomly chosen
 * irrelevant one. 0.5 is coin-flip. Computed by the rank-sum identity, with
 * average ranks so the many tied near-zero scores are handled correctly.
 */
function areaUnderCurve(observations: readonly LabelledScore[]): number {
  const positives = observations.filter(({ relevant }) => relevant).length;
  const negatives = observations.length - positives;

  if (positives === 0 || negatives === 0) return Number.NaN;

  const ordered = [...observations].sort((left, right) => left.score - right.score);
  const ranks = new Array<number>(ordered.length);

  for (let start = 0; start < ordered.length; ) {
    let end = start;
    while (end + 1 < ordered.length && ordered[end + 1].score === ordered[start].score) {
      end += 1;
    }

    // Ranks are 1-based; tied entries share the average of their rank span.
    const average = (start + end + 2) / 2;
    for (let index = start; index <= end; index += 1) ranks[index] = average;
    start = end + 1;
  }

  const positiveRankSum = ordered.reduce(
    (total, observation, index) => (observation.relevant ? total + ranks[index] : total),
    0,
  );

  return (positiveRankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

function asSearchResults(chunks: readonly LabelledChunk[]): SearchResult[] {
  return chunks.map((chunk) => ({
    chunk: { chunkId: chunk.chunkId } as SearchResult["chunk"],
    score: chunk.score,
    denseScore: chunk.denseScore,
    sparseScore: null,
  }));
}

const mean = (values: readonly number[]) =>
  values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

describe("calibration diagnostics", () => {
  it("sweeps error targets and reports how separable the scores are", async () => {
    const labelled = JSON.parse(
      await readFile(join(RESULTS, "labels.json"), "utf8"),
    ) as QuestionLabels[];

    const byReranker: LabelledScore[] = labelled.flatMap((question) =>
      question.retrieved.map((chunk) => ({ score: chunk.score, relevant: chunk.relevant })),
    );
    const byDense: LabelledScore[] = labelled.flatMap((question) =>
      question.retrieved.map((chunk) => ({
        score: chunk.denseScore ?? 0,
        relevant: chunk.relevant,
      })),
    );

    const separation = {
      rerankerAuc: areaUnderCurve(byReranker),
      denseAuc: areaUnderCurve(byDense),
      observations: byReranker.length,
      relevantShare: byReranker.filter(({ relevant }) => relevant).length / byReranker.length,
    };

    const grid = FALSE_ACCEPT_TARGETS.flatMap((maximumFalseAcceptRate) =>
      FALSE_REJECT_TARGETS.map((maximumFalseRejectRate) => {
        const fit = fitThresholds(byReranker, {
          maximumFalseAcceptRate,
          maximumFalseRejectRate,
        });
        const configuration = {
          acceptThreshold: fit.accept.threshold,
          rejectThreshold: fit.reject.threshold,
          ...BOUNDS,
        };
        const selections = labelled.map((question) => {
          const results = asSearchResults(question.retrieved);
          const selection = adaptiveSelect(results, configuration);
          const relevantByChunkId = new Map(
            question.retrieved.map((chunk) => [chunk.chunkId, chunk.relevant]),
          );
          const relevantIn = (chunks: readonly SearchResult[]) =>
            chunks.filter((result) => relevantByChunkId.get(result.chunk.chunkId)).length;

          return {
            decision: selection.decision,
            k: selection.k,
            relevant: relevantIn(selection.selected),
            precision: selection.k === 0 ? null : relevantIn(selection.selected) / selection.k,
            baselinePrecision: relevantIn(results.slice(0, BASELINE_K)) / BASELINE_K,
          };
        });
        const answered = selections.filter((selection) => selection.decision !== "reject");

        return {
          maximumFalseAcceptRate,
          maximumFalseRejectRate,
          acceptThreshold: fit.accept.threshold,
          rejectThreshold: fit.reject.threshold,
          acceptAttainable: fit.accept.attainable,
          decisions: {
            accept: selections.filter((s) => s.decision === "accept").length,
            ambiguous: selections.filter((s) => s.decision === "ambiguous").length,
            reject: selections.filter((s) => s.decision === "reject").length,
          },
          meanK: mean(answered.map((selection) => selection.k)),
          precision: mean(
            answered.flatMap((s) => (s.precision === null ? [] : [s.precision])),
          ),
          baselinePrecision: mean(selections.map((s) => s.baselinePrecision)),
          relevantPerAnsweredQuestion: mean(answered.map((s) => s.relevant)),
        };
      }),
    );

    await writeFile(
      join(RESULTS, "sweep.json"),
      JSON.stringify({ separation, grid }, null, 2),
    );

    log("");
    log(`  reranker AUC ${separation.rerankerAuc.toFixed(3)}   dense AUC ${separation.denseAuc.toFixed(3)}   relevant share ${(separation.relevantShare * 100).toFixed(1)}%`);
    log("");
    log("  FAR   FRR   accept     reject     acc/amb/rej   meanK  prec   fixed-k prec");
    for (const row of grid) {
      if (row.maximumFalseRejectRate !== 0.1) continue;
      log(
        `  ${row.maximumFalseAcceptRate.toFixed(2)}  ${row.maximumFalseRejectRate.toFixed(2)}  ` +
          `${row.acceptThreshold.toFixed(6)}  ${row.rejectThreshold.toFixed(6)}  ` +
          `${String(row.decisions.accept).padStart(3)}/${String(row.decisions.ambiguous).padStart(3)}/${String(row.decisions.reject).padStart(3)}   ` +
          `${row.meanK.toFixed(2)}   ${(row.precision * 100).toFixed(1)}%  ${(row.baselinePrecision * 100).toFixed(1)}%`,
      );
    }
    log("");

    expect(grid.length).toBe(FALSE_ACCEPT_TARGETS.length * FALSE_REJECT_TARGETS.length);
    expect(separation.observations).toBeGreaterThan(0);
  });

});
