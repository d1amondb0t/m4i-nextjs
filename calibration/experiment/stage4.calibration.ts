/**
 * Stage 4 — judge independence.
 *
 * Every number in this experiment rests on labels from qwen3.5:9b, and two of
 * the rerankers under test are that same model. This stage re-labels a
 * subsample with a different model family and reports agreement, so the
 * circularity is measured rather than assumed.
 *
 * Low agreement would not invalidate the retrieval comparison — all
 * configurations are scored against the same labels, so a shared bias mostly
 * cancels — but it would mean the LLM reranker rows are inflated relative to
 * the cross-encoder rows, which is exactly the comparison at issue.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Ollama } from "ollama";
import { describe, expect, it } from "vitest";

import { EXPERIMENT_RESULTS } from "./corpus";
import { judgeAll, judgementKey, loadJudgeCache, saveJudgeCache } from "./judge";
import { SECOND_JUDGE_MODEL } from "./matrix";

/** Passages sampled per question, spread across the ranking. */
const SAMPLE_PER_QUESTION = 6;
const SAMPLED_POOL = "a3.b4.c3";

const ollama = new Ollama(
  process.env.OLLAMA_HOST?.trim() ? { host: process.env.OLLAMA_HOST.trim() } : undefined,
);

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

type QuestionPool = {
  questionId: string;
  question: string;
  retrieved: { chunkId: string; body: string }[];
};

/**
 * Cohen's kappa: agreement corrected for what two judges would reach by
 * chance given their individual rates. Raw agreement alone is misleading when
 * one class dominates.
 */
function cohensKappa(
  pairs: readonly { a: boolean; b: boolean }[],
): { observed: number; expected: number; kappa: number } {
  const n = pairs.length;
  const bothTrue = pairs.filter((p) => p.a && p.b).length;
  const bothFalse = pairs.filter((p) => !p.a && !p.b).length;
  const aTrue = pairs.filter((p) => p.a).length / n;
  const bTrue = pairs.filter((p) => p.b).length / n;
  const observed = (bothTrue + bothFalse) / n;
  const expected = aTrue * bTrue + (1 - aTrue) * (1 - bTrue);

  return {
    observed,
    expected,
    kappa: expected === 1 ? 1 : (observed - expected) / (1 - expected),
  };
}

describe("stage 4 - judge independence", () => {
  it("re-labels a subsample with a second model family and reports agreement", async () => {
    const pool = JSON.parse(
      await readFile(join(EXPERIMENT_RESULTS, `pool-${SAMPLED_POOL}.json`), "utf8"),
    ) as QuestionPool[];
    const primary = await loadJudgeCache();
    const secondary = await loadJudgeCache("judge-cache-second.json");
    const pairs: { a: boolean; b: boolean }[] = [];

    for (const [position, entry] of pool.entries()) {
      // Even spread across the ranking, so the sample is not all easy top hits.
      const step = Math.max(1, Math.floor(entry.retrieved.length / SAMPLE_PER_QUESTION));
      const sampled = entry.retrieved
        .filter((_, index) => index % step === 0)
        .slice(0, SAMPLE_PER_QUESTION);
      const bodies = sampled.map((chunk) => chunk.body);
      const { judged } = await judgeAll(
        ollama,
        SECOND_JUDGE_MODEL,
        entry.questionId,
        entry.question,
        bodies,
        secondary,
      );

      if (judged > 0) await saveJudgeCache(secondary, "judge-cache-second.json");

      for (const body of bodies) {
        const key = judgementKey(entry.questionId, body);
        const a = primary.get(key);
        const b = secondary.get(key);

        if (a !== undefined && b !== undefined) pairs.push({ a, b });
      }

      if ((position + 1) % 20 === 0) {
        log(`[judge2] ${position + 1}/${pool.length} (${pairs.length} pairs)`);
      }
    }

    const agreement = cohensKappa(pairs);
    const primaryRate = pairs.filter((p) => p.a).length / pairs.length;
    const secondaryRate = pairs.filter((p) => p.b).length / pairs.length;
    const summary = {
      generatedAt: new Date().toISOString(),
      pool: SAMPLED_POOL,
      pairs: pairs.length,
      primaryModel: "qwen3.5:9b-q4_K_M",
      secondaryModel: SECOND_JUDGE_MODEL,
      primaryRelevantRate: primaryRate,
      secondaryRelevantRate: secondaryRate,
      ...agreement,
    };

    await writeFile(
      join(EXPERIMENT_RESULTS, "stage4-judge-agreement.json"),
      JSON.stringify(summary, null, 2),
    );

    log("");
    log(`  pairs compared        ${pairs.length}`);
    log(`  qwen  says relevant   ${(primaryRate * 100).toFixed(1)}%`);
    log(`  gemma says relevant   ${(secondaryRate * 100).toFixed(1)}%`);
    log(`  raw agreement         ${(agreement.observed * 100).toFixed(1)}%`);
    log(`  Cohen's kappa         ${agreement.kappa.toFixed(3)}`);
    log("");

    expect(pairs.length).toBeGreaterThan(0);
  });
});
