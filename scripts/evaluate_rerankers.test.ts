/**
 * Score the app's retrieved candidates with each locally cached cross-encoder,
 * using both the bare ontology question and the hierarchy pipeline's composite
 * category query. Models load from the local cache only.
 *
 * Reads calibration/results/app-retrieval/rankings-<LABEL>.json (default avg100)
 * and writes reranker-scores-<LABEL>.json with raw logits per question and chunk.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  type Tensor,
} from "@huggingface/transformers";
import { it } from "vitest";

import {
  buildCategoryQuery,
  parseFrameworkOntology,
} from "../app/server/rag/hierarchy/hierarchy-helper";
import type { DocumentChunk } from "../types/chunk-type";

const root = path.resolve(import.meta.dirname, "..");
const label = process.env.LABEL || "avg100";
const variant = process.env.VARIANT || "v4-flow";
const models = (
  process.env.MODELS ||
  "cross-encoder/ms-marco-MiniLM-L6-v2,Xenova/bge-reranker-base,mixedbread-ai/mxbai-rerank-xsmall-v1,jinaai/jina-reranker-v1-turbo-en"
).split(",");
const output = path.join(root, "calibration", "results", "app-retrieval");

it("scores retrieved candidates with cached cross-encoders", async () => {
  const rankings = JSON.parse(
    await readFile(path.join(output, `rankings-${label}.json`), "utf8"),
  ) as { configurations: Record<string, Record<string, string[]>> };
  const candidates: Record<string, Set<string>> = {};
  for (const [name, byQuestion] of Object.entries(rankings.configurations)) {
    if (name.endsWith("|sparse")) continue;
    for (const [question, ids] of Object.entries(byQuestion))
      for (const id of ids) (candidates[question] ??= new Set()).add(id);
  }

  const source = path.join(
    root,
    "calibration",
    "results",
    "chunking-variants",
    variant,
  );
  const text = new Map<string, string>();
  for (const name of (await readdir(source)).filter((file) =>
    file.endsWith(".pdf.json"),
  )) {
    const { chunks } = JSON.parse(
      await readFile(path.join(source, name), "utf8"),
    ) as {
      chunks: DocumentChunk[];
    };
    for (const chunk of chunks) text.set(chunk.chunkId, chunk.text);
  }

  const ontology = parseFrameworkOntology(
    JSON.parse(await readFile(path.join(root, "ontology.json"), "utf8")),
  );
  const queries: Record<string, { bare: string; composite: string }> = {};
  for (const dimension of ontology.dimensions)
    for (const category of dimension.categories)
      category.questions.forEach((question, index) => {
        queries[`${category.id}#${index + 1}`] = {
          bare: question,
          composite: buildCategoryQuery(dimension, category, question),
        };
      });

  const result: Record<string, unknown> = { label, variant, models: {} };
  for (const modelName of models) {
    let model: Awaited<
      ReturnType<typeof AutoModelForSequenceClassification.from_pretrained>
    >;
    let tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
    try {
      [model, tokenizer] = await Promise.all([
        AutoModelForSequenceClassification.from_pretrained(modelName, {
          local_files_only: true,
        }),
        AutoTokenizer.from_pretrained(modelName, { local_files_only: true }),
      ]);
    } catch (error) {
      (result.models as Record<string, unknown>)[modelName] = {
        error: String(error),
      };
      continue;
    }
    const scores: Record<string, Record<string, Record<string, number>>> = {
      bare: {},
      composite: {},
    };
    for (const [question, ids] of Object.entries(candidates)) {
      const list = [...ids];
      for (const mode of ["bare", "composite"] as const) {
        scores[mode][question] = {};
        for (let start = 0; start < list.length; start += 16) {
          const batch = list.slice(start, start + 16);
          const features = tokenizer(
            batch.map(() => queries[question][mode]),
            {
              text_pair: batch.map((id) => text.get(id)!),
              padding: true,
              truncation: true,
            },
          );
          const { logits } = (await model(features)) as { logits: Tensor };
          const values = Array.from(logits.data as Float32Array);
          const width = values.length / batch.length;
          batch.forEach((id, index) => {
            // Single-logit rerankers; for two-logit heads use the "relevant" logit.
            scores[mode][question][id] = values[index * width + width - 1];
          });
        }
      }
    }
    (result.models as Record<string, unknown>)[modelName] = scores;
    await writeFile(
      path.join(output, `reranker-scores-${label}.json`),
      JSON.stringify(result) + "\n",
    );
  }
});
