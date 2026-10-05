/**
 * Stage 2 — reranking.
 *
 * Takes the strongest first-stage pools from stage 1 plus the baseline, and
 * rescores each with every reranker. Nothing is retrieved and nothing is
 * judged here: a reranker only reorders a pool that is already labelled, so
 * the whole stage costs model inference and no LLM judging at all.
 *
 * That is the point of pooling. Comparing seven rerankers across four pools is
 * 28 evaluations for zero additional labels.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Ollama } from "ollama";
import { describe, expect, it } from "vitest";

import { listwiseRerank, pointwiseRerank, type Passage } from "@/app/server/rag/retrieval/llm-reranker";
import {
  areaUnderCurve,
  mean,
  ndcgAtK,
  precisionAtK,
  recallAtK,
  reciprocalRank,
} from "@/app/server/rag/retrieval/metrics";
import { crossEncoderScores, loadCrossEncoder } from "@/app/server/rag/retrieval/reranker-helper";
import { DEFAULT_RERANKING_CONFIGURATION } from "@/types/retrieval-types";
import { EXPERIMENT_RESULTS } from "./corpus";
import { judgementKey, loadJudgeCache } from "./judge";
import { JUDGE_MODEL, POOL_DEPTH, RERANKERS, type RerankerVariant } from "./matrix";

/** First-stage pools carried into stage 2: the top performers plus the baseline. */
const POOLS_TO_RERANK = 3;
const BASELINE_POOL = "a1.b1.c1";

const ollama = new Ollama(
  process.env.OLLAMA_HOST?.trim() ? { host: process.env.OLLAMA_HOST.trim() } : undefined,
);

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

type PooledChunk = { chunkId: string; body: string; score: number };
type QuestionPool = {
  questionId: string;
  dimensionId: string;
  question: string;
  retrieved: PooledChunk[];
};

async function rescore(
  reranker: RerankerVariant,
  question: string,
  passages: readonly Passage[],
  encoderCache: Map<string, Awaited<ReturnType<typeof loadCrossEncoder>>>,
): Promise<Map<string, number>> {
  if (reranker.kind === "none" || passages.length === 0) {
    return new Map();
  }

  if (reranker.kind === "cross_encoder") {
    const model = reranker.model!;
    let encoder = encoderCache.get(model);

    if (!encoder) {
      encoder = await loadCrossEncoder({ ...DEFAULT_RERANKING_CONFIGURATION, model });
      encoderCache.set(model, encoder);
    }

    const scores = await crossEncoderScores(
      encoder,
      question,
      passages.map((passage) => passage.text),
    );

    return new Map(passages.map((passage, index) => [passage.id, scores[index]]));
  }

  const scored =
    reranker.kind === "llm_listwise"
      ? await listwiseRerank(ollama, JUDGE_MODEL, question, passages)
      : await pointwiseRerank(ollama, JUDGE_MODEL, question, passages);

  return new Map(scored.map((entry) => [entry.id, entry.score]));
}

describe("stage 2 - reranking", () => {
  it("rescores the strongest pools with every reranker", async () => {
    const stage1 = JSON.parse(
      await readFile(join(EXPERIMENT_RESULTS, "stage1-metrics.json"), "utf8"),
    ) as { rows: { id: string; ndcgAt10: number }[] };
    const selected = [
      ...new Set([
        ...stage1.rows.slice(0, POOLS_TO_RERANK).map((row) => row.id),
        BASELINE_POOL,
      ]),
    ];
    const cache = await loadJudgeCache();
    const encoderCache = new Map<string, Awaited<ReturnType<typeof loadCrossEncoder>>>();
    const rows: Record<string, unknown>[] = [];

    log(`[stage2] pools: ${selected.join(", ")}`);

    for (const poolId of selected) {
      const path = join(EXPERIMENT_RESULTS, `pool-${poolId}.json`);

      if (!existsSync(path)) {
        log(`[stage2] pool ${poolId} missing, skipping`);
        continue;
      }

      const pool = JSON.parse(await readFile(path, "utf8")) as QuestionPool[];

      for (const reranker of RERANKERS) {
        const resultPath = join(
          EXPERIMENT_RESULTS,
          `rerank-${poolId}-${reranker.id}.json`,
        );

        const scoredPath = join(
          EXPERIMENT_RESULTS,
          `scored-${poolId}-${reranker.id}.json`,
        );

        // Both artefacts must exist: stage 3 calibrates from the scored file.
        if (existsSync(resultPath) && existsSync(scoredPath)) {
          rows.push(JSON.parse(await readFile(resultPath, "utf8")));
          log(`[stage2] ${poolId} x ${reranker.id} cached`);
          continue;
        }

        const started = Date.now();
        const perQuestion: {
          questionId: string;
          dimensionId: string;
          question: string;
          labels: boolean[];
          totalRelevant: number;
          observations: { chunkId: string; score: number; relevant: boolean }[];
        }[] = [];

        for (const entry of pool) {
          const labelled = entry.retrieved.map((chunk) => ({
            ...chunk,
            relevant: cache.get(judgementKey(entry.questionId, chunk.body)) === true,
          }));
          const scores = await rescore(
            reranker,
            entry.question,
            labelled.map((chunk) => ({ id: chunk.chunkId, text: chunk.body })),
            encoderCache,
          );
          const ordered =
            reranker.kind === "none"
              ? labelled
              : [...labelled].sort(
                  (left, right) =>
                    (scores.get(right.chunkId) ?? 0) - (scores.get(left.chunkId) ?? 0),
                );

          perQuestion.push({
            questionId: entry.questionId,
            dimensionId: entry.dimensionId,
            question: entry.question,
            labels: ordered.map((chunk) => chunk.relevant),
            totalRelevant: labelled.filter((chunk) => chunk.relevant).length,
            observations: ordered.map((chunk) => ({
              chunkId: chunk.chunkId,
              score: scores.get(chunk.chunkId) ?? chunk.score,
              relevant: chunk.relevant,
            })),
          });
        }

        // Persisted so stage 3 can calibrate thresholds without rescoring.
        await writeFile(
          join(EXPERIMENT_RESULTS, `scored-${poolId}-${reranker.id}.json`),
          JSON.stringify(
            perQuestion.map((entry) => ({
              questionId: entry.questionId,
              dimensionId: entry.dimensionId,
              observations: entry.observations,
            })),
          ),
        );

        const row = {
          pool: poolId,
          reranker: reranker.id,
          rerankerLabel: reranker.label,
          precisionAt3: mean(perQuestion.map((q) => precisionAtK(q.labels, 3))),
          precisionAt5: mean(perQuestion.map((q) => precisionAtK(q.labels, 5))),
          precisionAt10: mean(perQuestion.map((q) => precisionAtK(q.labels, 10))),
          ndcgAt10: mean(
            perQuestion.map((q) => ndcgAtK(q.labels, 10, q.totalRelevant)),
          ),
          recallAt5: mean(perQuestion.map((q) => recallAtK(q.labels, 5, q.totalRelevant))),
          mrr: mean(perQuestion.map((q) => reciprocalRank(q.labels))),
          auc: areaUnderCurve(perQuestion.flatMap((q) => q.observations)),
          seconds: Math.round((Date.now() - started) / 1000),
        };

        await writeFile(resultPath, JSON.stringify(row, null, 2));
        rows.push(row);
        log(
          `[stage2] ${poolId} x ${reranker.id} nDCG@10 ${(row.ndcgAt10 * 100).toFixed(1)}%  P@5 ${(row.precisionAt5 * 100).toFixed(1)}%  AUC ${Number.isNaN(row.auc) ? "n/a" : row.auc.toFixed(3)}  (${row.seconds}s)`,
        );
      }
    }

    rows.sort((left, right) => (right.ndcgAt10 as number) - (left.ndcgAt10 as number));
    await writeFile(
      join(EXPERIMENT_RESULTS, "stage2-metrics.json"),
      JSON.stringify({ generatedAt: new Date().toISOString(), poolDepth: POOL_DEPTH, rows }, null, 2),
    );

    log("");
    log("  pool         reranker                        nDCG@10   P@5     P@10    AUC");
    for (const row of rows) {
      log(
        `  ${String(row.pool).padEnd(11)}  ${String(row.rerankerLabel).padEnd(30)}  ` +
          `${((row.ndcgAt10 as number) * 100).toFixed(1).padStart(6)}%  ${((row.precisionAt5 as number) * 100).toFixed(1).padStart(5)}%  ${((row.precisionAt10 as number) * 100).toFixed(1).padStart(5)}%  ${Number.isNaN(row.auc as number) ? "  n/a" : (row.auc as number).toFixed(3)}`,
      );
    }
    log("");

    expect(rows.length).toBeGreaterThan(0);
  });
});
