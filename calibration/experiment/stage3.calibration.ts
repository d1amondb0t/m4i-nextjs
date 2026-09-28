/**
 * Stage 3 — selection and calibration.
 *
 * Compares three ways of deciding how much retrieved evidence to use, on the
 * winning configurations from stage 2:
 *
 *   E1  fixed k
 *   E2  adaptive k, thresholds fitted on all questions   (the earlier method)
 *   E3  adaptive k, thresholds fitted on a calibration split and evaluated on
 *       held-out questions, with the reject threshold set by the conformal
 *       quantile
 *
 * E2 is included precisely so the optimism of fitting and evaluating on the
 * same questions can be measured rather than assumed.
 *
 * Out-of-scope questions are retrieved and rescored here too, because the
 * reject threshold needs a negative class and the in-scope questions do not
 * provide one.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Ollama } from "ollama";
import { describe, expect, it } from "vitest";

import { OllamaEmbedder } from "@/app/server/rag/embeddings/ollama-embedder";
import { storageFromEnvironment } from "@/app/server/rag/pipeline/rag-pipeline-helper";
import { adaptiveSelect } from "@/app/server/rag/retrieval/adaptive-k";
import { conformalThreshold, splitIndices } from "@/app/server/rag/retrieval/conformal";
import { listwiseRerank, pointwiseRerank } from "@/app/server/rag/retrieval/llm-reranker";
import { mean, precisionAtK } from "@/app/server/rag/retrieval/metrics";
import { crossEncoderScores, loadCrossEncoder } from "@/app/server/rag/retrieval/reranker-helper";
import { Retriever } from "@/app/server/rag/retrieval/retrieval";
import { fitAcceptThreshold } from "@/app/server/rag/retrieval/threshold-fitting";
import { QdrantStore } from "@/app/server/rag/storage/vector-storage";
import { DEFAULT_RERANKING_CONFIGURATION } from "@/types/retrieval-types";
import { CALIBRATION, chunkBody, EXPERIMENT_RESULTS } from "./corpus";
import {
  collectionName,
  EMBEDDINGS,
  JUDGE_MODEL,
  POOL_DEPTH,
  RERANKERS,
  RETRIEVAL,
} from "./matrix";

const CONFIGURATIONS_TO_CALIBRATE = 2;
const BASELINE_K = 5;
const ADAPTIVE_BOUNDS = { minimumK: 3, maximumK: 12, relativeDropoff: 0.01 };
const MAX_FALSE_ACCEPT = 0.4;
const REJECT_ALPHA = 0.05;

const storage = storageFromEnvironment();
const ollama = new Ollama(
  process.env.OLLAMA_HOST?.trim() ? { host: process.env.OLLAMA_HOST.trim() } : undefined,
);

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

type Scored = {
  questionId: string;
  dimensionId: string;
  observations: { chunkId: string; score: number; relevant: boolean }[];
};

/** Rebuilds the minimal SearchResult shape adaptiveSelect needs. */
function asResults(observations: Scored["observations"]) {
  return observations.map((observation) => ({
    chunk: { chunkId: observation.chunkId },
    score: observation.score,
    denseScore: null,
    sparseScore: null,
  })) as unknown as Parameters<typeof adaptiveSelect>[0];
}

async function outOfScopeTopScores(
  poolId: string,
  rerankerId: string,
): Promise<number[]> {
  const cachePath = join(
    EXPERIMENT_RESULTS,
    `oos-${poolId}-${rerankerId}.json`,
  );

  if (existsSync(cachePath)) {
    return JSON.parse(await readFile(cachePath, "utf8")) as number[];
  }

  const [chunkingId, embeddingId, retrievalId] = poolId.split(".");
  const embedding = EMBEDDINGS.find((entry) => entry.id === embeddingId)!;
  const retrieval = RETRIEVAL.find((entry) => entry.id === retrievalId)!;
  const reranker = RERANKERS.find((entry) => entry.id === rerankerId)!;
  const { questions } = JSON.parse(
    await readFile(join(CALIBRATION, "out-of-scope-questions.json"), "utf8"),
  ) as { questions: string[] };
  const retriever = new Retriever(
    new QdrantStore(storage, collectionName(chunkingId, embeddingId)),
    new OllamaEmbedder(embedding.model, embedding.batchSize, embedding.queryPrefix, ollama),
    {
      strategy: retrieval.strategy,
      topK: POOL_DEPTH,
      denseCandidates: POOL_DEPTH,
      sparseCandidates: POOL_DEPTH,
    },
    { ...DEFAULT_RERANKING_CONFIGURATION, enabled: false },
  );
  const encoder =
    reranker.kind === "cross_encoder"
      ? await loadCrossEncoder({ ...DEFAULT_RERANKING_CONFIGURATION, model: reranker.model! })
      : null;
  const tops: number[] = [];

  for (const question of questions) {
    const results = await retriever.retrieve(question);
    const passages = results.map((result) => ({
      id: result.chunk.chunkId,
      text: chunkBody(result.chunk.text),
    }));

    let scores: number[];

    if (reranker.kind === "none") {
      scores = results.map((result) => result.score);
    } else if (encoder) {
      scores = await crossEncoderScores(
        encoder,
        question,
        passages.map((passage) => passage.text),
      );
    } else {
      const scored =
        reranker.kind === "llm_listwise"
          ? await listwiseRerank(ollama, JUDGE_MODEL, question, passages)
          : await pointwiseRerank(ollama, JUDGE_MODEL, question, passages);
      scores = scored.map((entry) => entry.score);
    }

    tops.push(scores.length === 0 ? 0 : Math.max(...scores));
  }

  await writeFile(cachePath, JSON.stringify(tops));
  return tops;
}

describe("stage 3 - selection and calibration", () => {
  it("compares fixed k, fitted adaptive k, and split-conformal adaptive k", async () => {
    const stage2 = JSON.parse(
      await readFile(join(EXPERIMENT_RESULTS, "stage2-metrics.json"), "utf8"),
    ) as { rows: { pool: string; reranker: string; rerankerLabel: string; ndcgAt10: number }[] };
    // Only rerankers that yield an absolute score can carry a global accept
    // threshold; listwise returns a within-question rank, so it is excluded.
    const eligible = stage2.rows.filter((row) => row.reranker !== "d6");
    const chosen = eligible.slice(0, CONFIGURATIONS_TO_CALIBRATE);
    const summaries: Record<string, unknown>[] = [];

    for (const configuration of chosen) {
      const scoredPath = join(
        EXPERIMENT_RESULTS,
        `scored-${configuration.pool}-${configuration.reranker}.json`,
      );

      if (!existsSync(scoredPath)) {
        log(`[stage3] missing scores for ${configuration.pool} x ${configuration.reranker}`);
        continue;
      }

      const scored = JSON.parse(await readFile(scoredPath, "utf8")) as Scored[];
      const split = splitIndices(scored.length);
      const calibration = split.calibration.map((index) => scored[index]);
      const evaluation = split.evaluation.map((index) => scored[index]);
      const outOfScope = await outOfScopeTopScores(
        configuration.pool,
        configuration.reranker,
      );

      const observationsOf = (entries: readonly Scored[]) =>
        entries.flatMap((entry) =>
          entry.observations.map((observation) => ({
            score: observation.score,
            relevant: observation.relevant,
          })),
        );
      const topScoreOf = (entry: Scored) =>
        entry.observations.length === 0
          ? 0
          : Math.max(...entry.observations.map((observation) => observation.score));

      // E2: fitted on everything, evaluated on everything.
      const optimisticAccept = fitAcceptThreshold(observationsOf(scored), MAX_FALSE_ACCEPT);
      const optimisticReject = conformalThreshold(scored.map(topScoreOf), REJECT_ALPHA);

      // E3: fitted on the calibration half only.
      const honestAccept = fitAcceptThreshold(
        observationsOf(calibration),
        MAX_FALSE_ACCEPT,
      );
      const honestReject = conformalThreshold(calibration.map(topScoreOf), REJECT_ALPHA);

      const evaluate = (
        entries: readonly Scored[],
        acceptThreshold: number,
        rejectThreshold: number,
      ) => {
        const rows = entries.map((entry) => {
          const selection = adaptiveSelect(asResults(entry.observations), {
            acceptThreshold,
            rejectThreshold: Math.min(rejectThreshold, acceptThreshold),
            ...ADAPTIVE_BOUNDS,
          });
          const relevantById = new Map(
            entry.observations.map((observation) => [observation.chunkId, observation.relevant]),
          );
          const relevant = selection.selected.filter((result) =>
            relevantById.get(result.chunk.chunkId),
          ).length;

          return {
            decision: selection.decision,
            k: selection.k,
            relevant,
            precision: selection.k === 0 ? null : relevant / selection.k,
          };
        });
        const answered = rows.filter((row) => row.decision !== "reject");

        return {
          precision: mean(
            answered.flatMap((row) => (row.precision === null ? [] : [row.precision])),
          ),
          meanK: mean(rows.map((row) => row.k)),
          relevantPerQuestion: mean(rows.map((row) => row.relevant)),
          rejected: rows.filter((row) => row.decision === "reject").length,
          accepted: rows.filter((row) => row.decision === "accept").length,
          questions: rows.length,
        };
      };

      const fixedK = {
        precision: mean(
          evaluation.map((entry) =>
            precisionAtK(
              entry.observations.map((observation) => observation.relevant),
              BASELINE_K,
            ),
          ),
        ),
        meanK: BASELINE_K,
        relevantPerQuestion: mean(
          evaluation.map(
            (entry) =>
              entry.observations.slice(0, BASELINE_K).filter((o) => o.relevant).length,
          ),
        ),
        rejected: 0,
        accepted: 0,
        questions: evaluation.length,
      };

      const summary = {
        pool: configuration.pool,
        reranker: configuration.reranker,
        rerankerLabel: configuration.rerankerLabel,
        splitSizes: { calibration: calibration.length, evaluation: evaluation.length },
        thresholds: {
          optimistic: {
            accept: optimisticAccept.threshold,
            reject: optimisticReject.threshold,
          },
          honest: {
            accept: honestAccept.threshold,
            reject: honestReject.threshold,
            conformalSupported: honestReject.supported,
            smallestSupportedAlpha: honestReject.smallestSupportedAlpha,
          },
        },
        e1FixedK: fixedK,
        // Fitted on all, scored on all: the number the earlier run reported.
        e2FittedAll: evaluate(scored, optimisticAccept.threshold, optimisticReject.threshold),
        // Fitted on calibration, scored on held-out: the honest number.
        e3SplitConformal: evaluate(
          evaluation,
          honestAccept.threshold,
          honestReject.threshold,
        ),
        outOfScope: {
          questions: outOfScope.length,
          caughtOptimistic:
            outOfScope.filter((score) => score < optimisticReject.threshold).length /
            outOfScope.length,
          caughtHonest:
            outOfScope.filter((score) => score < honestReject.threshold).length /
            outOfScope.length,
        },
      };

      summaries.push(summary);

      log("");
      log(`  ${configuration.pool} x ${configuration.rerankerLabel}`);
      log(`    accept threshold  optimistic ${optimisticAccept.threshold.toFixed(6)}  honest ${honestAccept.threshold.toFixed(6)}`);
      log(`    reject threshold  optimistic ${optimisticReject.threshold.toFixed(6)}  honest ${honestReject.threshold.toFixed(6)}`);
      log(`    E1 fixed k=${BASELINE_K}        precision ${(fixedK.precision * 100).toFixed(1)}%  relevant/q ${fixedK.relevantPerQuestion.toFixed(2)}`);
      log(`    E2 fitted-on-all      precision ${(summary.e2FittedAll.precision * 100).toFixed(1)}%  meanK ${summary.e2FittedAll.meanK.toFixed(2)}  rejected ${summary.e2FittedAll.rejected}/${summary.e2FittedAll.questions}`);
      log(`    E3 split-conformal    precision ${(summary.e3SplitConformal.precision * 100).toFixed(1)}%  meanK ${summary.e3SplitConformal.meanK.toFixed(2)}  rejected ${summary.e3SplitConformal.rejected}/${summary.e3SplitConformal.questions}`);
      log(`    out-of-scope caught   ${(summary.outOfScope.caughtHonest * 100).toFixed(1)}% (honest threshold)`);
    }

    await writeFile(
      join(EXPERIMENT_RESULTS, "stage3-calibration.json"),
      JSON.stringify({ generatedAt: new Date().toISOString(), summaries }, null, 2),
    );

    log("");
    expect(summaries.length).toBeGreaterThan(0);
  });
});
