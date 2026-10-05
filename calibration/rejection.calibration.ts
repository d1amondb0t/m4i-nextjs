/**
 * Fits the automatic rejection threshold.
 *
 * The in-scope set cannot place this threshold on its own: every ontology
 * question finds at least one relevant chunk in the corpus, so it contains no
 * negatives. This stage supplies the missing negative class by retrieving for
 * questions that are deliberately outside every corpus topic, and fits the
 * threshold on the two samples of per-question top scores.
 *
 * The reject decision is made per question, on the top score, so it is fitted
 * per question rather than per chunk.
 *
 * Requires live Ollama and Qdrant. Reads labels.json, writes rejection.json.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ollama } from "ollama";
import { describe, expect, it } from "vitest";

import { OllamaEmbedder } from "@/app/server/rag/embeddings/ollama-embedder";
import { ragPipelineConfigurationFromEnvironment } from "@/app/server/rag/pipeline/rag-pipeline-helper";
import { adaptiveSelect } from "@/app/server/rag/retrieval/adaptive-k";
import { Retriever } from "@/app/server/rag/retrieval/retrieval";
import {
  fitRejectThreshold,
  type LabelledScore,
} from "@/app/server/rag/retrieval/threshold-fitting";
import { QdrantStore } from "@/app/server/rag/storage/vector-storage";
import {
  DEFAULT_RERANKING_CONFIGURATION,
  DEFAULT_RETRIEVAL_CONFIGURATION,
} from "@/types/retrieval-types";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS = join(HERE, "results");
const COLLECTION = "m4i_calibration";
const CANDIDATES = 20;

/** Share of in-scope questions it is acceptable to reject by mistake. */
const FALSE_REJECT_TARGETS = [0.01, 0.02, 0.05, 0.1, 0.2];

type QuestionLabels = { questionId: string; retrieved: { score: number }[] };

const configuration = {
  ...ragPipelineConfigurationFromEnvironment(),
  collection: COLLECTION,
};

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

const topScore = (scores: readonly number[]) => (scores.length === 0 ? 0 : Math.max(...scores));

describe("rejection calibration", () => {
  it("fits the reject threshold against out-of-scope questions", async () => {
    const scoresPath = join(RESULTS, "out-of-scope-scores.json");
    let outOfScope: { question: string; topScore: number }[];

    if (existsSync(scoresPath)) {
      outOfScope = JSON.parse(await readFile(scoresPath, "utf8"));
      log(`[reject] cached: ${outOfScope.length} out-of-scope questions`);
    } else {
      const { questions } = JSON.parse(
        await readFile(join(HERE, "out-of-scope-questions.json"), "utf8"),
      ) as { questions: string[] };
      const ollama = new Ollama(
        configuration.ollamaHost ? { host: configuration.ollamaHost } : undefined,
      );
      const retriever = new Retriever(
        new QdrantStore(configuration.storage, COLLECTION),
        new OllamaEmbedder(
          configuration.embeddingModel,
          configuration.embeddingBatchSize,
          configuration.queryPrefix,
          ollama,
        ),
        { ...DEFAULT_RETRIEVAL_CONFIGURATION, topK: CANDIDATES },
        { ...DEFAULT_RERANKING_CONFIGURATION, enabled: true, candidates: CANDIDATES },
      );

      outOfScope = [];

      for (const [position, question] of questions.entries()) {
        const results = await retriever.retrieve(question);
        const top = topScore(results.map((result) => result.score));

        outOfScope.push({ question, topScore: top });
        log(`[reject] ${position + 1}/${questions.length} top ${top.toFixed(5)}`);
      }

      await writeFile(scoresPath, JSON.stringify(outOfScope, null, 2));
    }

    const labelled = JSON.parse(
      await readFile(join(RESULTS, "labels.json"), "utf8"),
    ) as QuestionLabels[];
    const inScope = labelled.map((question) => ({
      questionId: question.questionId,
      topScore: topScore(question.retrieved.map((chunk) => chunk.score)),
    }));

    // In-scope questions all carry evidence, so they are the positives;
    // out-of-scope questions carry none, so they are the negatives.
    const observations: LabelledScore[] = [
      ...inScope.map((question) => ({ score: question.topScore, relevant: true })),
      ...outOfScope.map((question) => ({ score: question.topScore, relevant: false })),
    ];

    const fits = FALSE_REJECT_TARGETS.map((target) => {
      const fit = fitRejectThreshold(observations, target);
      const wronglyRejected = inScope.filter(
        (question) => question.topScore < fit.threshold,
      ).length;
      const correctlyRejected = outOfScope.filter(
        (question) => question.topScore < fit.threshold,
      ).length;

      return {
        maximumFalseRejectRate: target,
        threshold: fit.threshold,
        falseRejectRate: wronglyRejected / inScope.length,
        outOfScopeRejectionRate: correctlyRejected / outOfScope.length,
        inScopeRejected: wronglyRejected,
        outOfScopeRejected: correctlyRejected,
      };
    });

    const summary = {
      generatedAt: new Date().toISOString(),
      inScopeQuestions: inScope.length,
      outOfScopeQuestions: outOfScope.length,
      inScopeTopScoreMedian: [...inScope]
        .map((question) => question.topScore)
        .sort((left, right) => left - right)[Math.floor(inScope.length / 2)],
      outOfScopeTopScoreMedian: [...outOfScope]
        .map((question) => question.topScore)
        .sort((left, right) => left - right)[Math.floor(outOfScope.length / 2)],
      fits,
    };

    await writeFile(join(RESULTS, "rejection.json"), JSON.stringify(summary, null, 2));

    log("");
    log(`  in-scope median top score      ${summary.inScopeTopScoreMedian.toFixed(5)}`);
    log(`  out-of-scope median top score  ${summary.outOfScopeTopScoreMedian.toFixed(5)}`);
    log("");
    log("  target  threshold    in-scope wrongly rejected   out-of-scope caught");
    for (const fit of fits) {
      log(
        `  ${fit.maximumFalseRejectRate.toFixed(2)}    ${fit.threshold.toFixed(6)}    ` +
          `${String(fit.inScopeRejected).padStart(2)}/${inScope.length} (${(fit.falseRejectRate * 100).toFixed(1)}%)` +
          `             ${String(fit.outOfScopeRejected).padStart(2)}/${outOfScope.length} (${(fit.outOfScopeRejectionRate * 100).toFixed(1)}%)`,
      );
    }
    log("");

    expect(fits.length).toBe(FALSE_REJECT_TARGETS.length);
  });

  it("combines both fits into a recommended configuration and evaluates it", async () => {
    const rejection = JSON.parse(
      await readFile(join(RESULTS, "rejection.json"), "utf8"),
    ) as { fits: { maximumFalseRejectRate: number; threshold: number; falseRejectRate: number; outOfScopeRejectionRate: number }[] };
    const thresholds = JSON.parse(
      await readFile(join(RESULTS, "thresholds.json"), "utf8"),
    ) as { fitted: { acceptThreshold: number }; global: { accept: { observedRate: number } } };
    const labelled = JSON.parse(
      await readFile(join(RESULTS, "labels.json"), "utf8"),
    ) as { questionId: string; retrieved: { chunkId: string; score: number; relevant: boolean }[] }[];

    const rejectFit = rejection.fits.find((fit) => fit.maximumFalseRejectRate === 0.05);

    if (!rejectFit) throw new Error("No reject fit at the 5% target.");

    const recommended = {
      acceptThreshold: thresholds.fitted.acceptThreshold,
      rejectThreshold: rejectFit.threshold,
      minimumK: 3,
      maximumK: 12,
      relativeDropoff: 0.01,
    };

    const evaluated = labelled.map((question) => {
      const results = question.retrieved.map((chunk) => ({
        chunk: { chunkId: chunk.chunkId } as { chunkId: string },
        score: chunk.score,
        denseScore: null,
        sparseScore: null,
      }));
      const selection = adaptiveSelect(
        results as unknown as Parameters<typeof adaptiveSelect>[0],
        recommended,
      );
      const relevantByChunkId = new Map(
        question.retrieved.map((chunk) => [chunk.chunkId, chunk.relevant]),
      );
      const relevant = selection.selected.filter((result) =>
        relevantByChunkId.get(result.chunk.chunkId),
      ).length;

      return {
        questionId: question.questionId,
        decision: selection.decision,
        k: selection.k,
        relevant,
        precision: selection.k === 0 ? null : relevant / selection.k,
        baselineRelevant: question.retrieved
          .slice(0, DEFAULT_RETRIEVAL_CONFIGURATION.topK)
          .filter((chunk) => chunk.relevant).length,
      };
    });

    const answered = evaluated.filter((question) => question.decision !== "reject");
    const average = (values: readonly number[]) =>
      values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
    const summary = {
      generatedAt: new Date().toISOString(),
      recommended,
      basis: {
        acceptFalseAcceptRate: thresholds.global.accept.observedRate,
        rejectFalseRejectRate: rejectFit.falseRejectRate,
        rejectOutOfScopeRejectionRate: rejectFit.outOfScopeRejectionRate,
      },
      decisions: {
        accept: evaluated.filter((q) => q.decision === "accept").length,
        ambiguous: evaluated.filter((q) => q.decision === "ambiguous").length,
        reject: evaluated.filter((q) => q.decision === "reject").length,
      },
      adaptiveK: {
        mean: average(answered.map((question) => question.k)),
        min: answered.length === 0 ? 0 : Math.min(...answered.map((q) => q.k)),
        max: answered.length === 0 ? 0 : Math.max(...answered.map((q) => q.k)),
      },
      precision: {
        adaptive: average(
          answered.flatMap((q) => (q.precision === null ? [] : [q.precision])),
        ),
        fixedK: average(
          evaluated.map(
            (question) => question.baselineRelevant / DEFAULT_RETRIEVAL_CONFIGURATION.topK,
          ),
        ),
      },
      chunksPerQuestion: {
        adaptive: average(evaluated.map((question) => question.k)),
        fixedK: DEFAULT_RETRIEVAL_CONFIGURATION.topK,
      },
      perQuestion: evaluated,
    };

    await writeFile(
      join(RESULTS, "recommended-configuration.json"),
      JSON.stringify(summary, null, 2),
    );

    log("");
    log("  RECOMMENDED CONFIGURATION");
    log(`    acceptThreshold  ${recommended.acceptThreshold.toFixed(6)}  (${(summary.basis.acceptFalseAcceptRate * 100).toFixed(1)}% of accepted chunks irrelevant)`);
    log(`    rejectThreshold  ${recommended.rejectThreshold.toFixed(6)}  (${(summary.basis.rejectFalseRejectRate * 100).toFixed(1)}% in-scope lost, ${(summary.basis.rejectOutOfScopeRejectionRate * 100).toFixed(1)}% out-of-scope caught)`);
    log(`    k in [${recommended.minimumK}, ${recommended.maximumK}], drop-off ${recommended.relativeDropoff}`);
    log(`    decisions        accept ${summary.decisions.accept}, ambiguous ${summary.decisions.ambiguous}, reject ${summary.decisions.reject}`);
    log(`    adaptive k       mean ${summary.adaptiveK.mean.toFixed(2)} (range ${summary.adaptiveK.min}-${summary.adaptiveK.max}) vs fixed ${DEFAULT_RETRIEVAL_CONFIGURATION.topK}`);
    log(`    precision        ${(summary.precision.adaptive * 100).toFixed(1)}% vs fixed-k ${(summary.precision.fixedK * 100).toFixed(1)}%`);
    log("");

    expect(recommended.rejectThreshold).toBeLessThanOrEqual(recommended.acceptThreshold);
  });

  it("tunes the adaptive-k bounds against the precision/recall trade-off", async () => {
    const { recommended } = JSON.parse(
      await readFile(join(RESULTS, "recommended-configuration.json"), "utf8"),
    ) as { recommended: { acceptThreshold: number; rejectThreshold: number } };
    const labelled = JSON.parse(
      await readFile(join(RESULTS, "labels.json"), "utf8"),
    ) as { retrieved: { chunkId: string; score: number; relevant: boolean }[] }[];

    const baselineK = DEFAULT_RETRIEVAL_CONFIGURATION.topK;
    const average = (values: readonly number[]) =>
      values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
    const baselineRelevant = average(
      labelled.map(
        (question) =>
          question.retrieved.slice(0, baselineK).filter((chunk) => chunk.relevant).length,
      ),
    );
    const poolRelevant = labelled.map(
      (question) => question.retrieved.filter((chunk) => chunk.relevant).length,
    );

    const variants = [1, 2, 3, 5].flatMap((minimumK) =>
      [0.01, 0.05, 0.1, 0.25, 0.5].map((relativeDropoff) => {
        const rows = labelled.map((question, index) => {
          const results = question.retrieved.map((chunk) => ({
            chunk: { chunkId: chunk.chunkId },
            score: chunk.score,
            denseScore: null,
            sparseScore: null,
          }));
          const selection = adaptiveSelect(
            results as unknown as Parameters<typeof adaptiveSelect>[0],
            { ...recommended, minimumK, maximumK: 12, relativeDropoff },
          );
          const relevantByChunkId = new Map(
            question.retrieved.map((chunk) => [chunk.chunkId, chunk.relevant]),
          );
          const relevant = selection.selected.filter((result) =>
            relevantByChunkId.get(result.chunk.chunkId),
          ).length;

          return {
            k: selection.k,
            relevant,
            precision: selection.k === 0 ? null : relevant / selection.k,
            recall: poolRelevant[index] === 0 ? 0 : relevant / poolRelevant[index],
          };
        });

        return {
          minimumK,
          relativeDropoff,
          meanK: average(rows.map((row) => row.k)),
          precision: average(
            rows.flatMap((row) => (row.precision === null ? [] : [row.precision])),
          ),
          relevantPerQuestion: average(rows.map((row) => row.relevant)),
          recall: average(rows.map((row) => row.recall)),
        };
      }),
    );

    await writeFile(
      join(RESULTS, "adaptive-k-bounds.json"),
      JSON.stringify(
        {
          baseline: {
            k: baselineK,
            precision: baselineRelevant / baselineK,
            relevantPerQuestion: baselineRelevant,
          },
          variants,
        },
        null,
        2,
      ),
    );

    log("");
    log(`  baseline fixed k=${baselineK}: precision ${((baselineRelevant / baselineK) * 100).toFixed(1)}%, relevant/question ${baselineRelevant.toFixed(2)}`);
    log("  minK  dropoff  meanK  precision  relevant/q  recall");
    for (const variant of variants) {
      log(
        `  ${String(variant.minimumK).padStart(4)}  ${variant.relativeDropoff.toFixed(2).padStart(7)}  ` +
          `${variant.meanK.toFixed(2).padStart(5)}  ${(variant.precision * 100).toFixed(1).padStart(8)}%  ` +
          `${variant.relevantPerQuestion.toFixed(2).padStart(10)}  ${(variant.recall * 100).toFixed(1).padStart(5)}%`,
      );
    }
    log("");

    expect(variants.length).toBe(20);
  });
});
