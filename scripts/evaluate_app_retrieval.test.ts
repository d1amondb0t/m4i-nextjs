/**
 * Rank the 84 ontology questions through the app's own Retriever and QdrantStore
 * on an indexed chunking variant, so the screened benchmark can judge and score
 * the app's dense, BM25 and hybrid retrieval.
 *
 * PHASE=rank (default): top-20 per question for each strategy, written to
 *   calibration/results/app-retrieval/rankings-<label>.json.
 * PHASE=bm25: rewrite every point's BM25 vector with DEFAULT_BM25_OPTIONS
 *   (vectors only; payloads and dense vectors are unchanged).
 *
 * COLLECTION (default rag_chunking_v4_flow), VARIANT (default v4-flow) and LABEL
 * (default "current") select the collection, its exported chunks and the output.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Ollama } from "ollama";
import { QdrantClient } from "@qdrant/js-client-rest";
import { it } from "vitest";

import { OllamaEmbedder } from "../app/server/rag/embeddings/ollama-embedder";
import { DEFAULT_RAG_PIPELINE_CONFIGURATION } from "../app/server/rag/pipeline/rag-pipeline-helper";
import { Retriever } from "../app/server/rag/retrieval/retrieval";
import { pointId } from "../app/server/rag/storage/storage-helper";
import {
  DEFAULT_BM25_OPTIONS,
  QdrantStore,
} from "../app/server/rag/storage/vector-storage";
import type { DocumentChunk } from "../types/chunk-type";

const root = path.resolve(import.meta.dirname, "..");
const collection = process.env.COLLECTION || "rag_chunking_v4_flow";
const variant = process.env.VARIANT || "v4-flow";
const label = process.env.LABEL || "current";
const phase = process.env.PHASE || "rank";
const output = path.join(root, "calibration", "results", "app-retrieval");

it(`${phase}: ${collection}`, async () => {
  const config = DEFAULT_RAG_PIPELINE_CONFIGURATION;
  const client = new QdrantClient(config.storage);
  await mkdir(output, { recursive: true });

  if (phase === "bm25") {
    const source = path.join(
      root,
      "calibration",
      "results",
      "chunking-variants",
      variant,
    );
    const files = (await readdir(source)).filter((name) =>
      name.endsWith(".pdf.json"),
    );
    let updated = 0;
    for (const name of files) {
      const { chunks } = JSON.parse(
        await readFile(path.join(source, name), "utf8"),
      ) as {
        chunks: DocumentChunk[];
      };
      for (let start = 0; start < chunks.length; start += 256) {
        await client.updateVectors(collection, {
          wait: true,
          points: chunks.slice(start, start + 256).map((chunk) => ({
            id: pointId(chunk),
            vector: {
              sparse: {
                text: chunk.text,
                model: "qdrant/bm25",
                options: { ...DEFAULT_BM25_OPTIONS },
              },
            },
          })),
        });
      }
      updated += chunks.length;
    }
    await writeFile(
      path.join(output, `bm25-update-${collection}.json`),
      JSON.stringify(
        { collection, updated, options: DEFAULT_BM25_OPTIONS },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  const benchmark = JSON.parse(
    await readFile(
      path.join(
        root,
        "calibration",
        "results",
        `screened-benchmark-${variant}`,
        "rankings.json",
      ),
      "utf8",
    ),
  ) as { questions: Record<string, { text: string; dimension: string }> };
  const store = new QdrantStore(config.storage, collection, client);
  const embedder = new OllamaEmbedder(
    config.embeddingModel,
    16,
    config.queryPrefix,
    new Ollama(),
  );
  const configurations: Record<string, Record<string, string[]>> = {};
  for (const strategy of ["dense", "sparse", "hybrid"] as const) {
    const retriever = new Retriever(store, embedder, {
      ...config.retrieval,
      strategy,
      topK: 20,
    });
    const name = `app-${label}|${strategy === "sparse" ? "qdrant-bm25" : "bge-base"}|${strategy}`;
    configurations[name] = {};
    for (const [key, question] of Object.entries(benchmark.questions)) {
      const results = await retriever.retrieve(question.text, {});
      configurations[name][key] = results.map((result) => result.chunk.chunkId);
    }
  }
  await writeFile(
    path.join(output, `rankings-${label}.json`),
    JSON.stringify({ collection, variant, configurations }, null, 2) + "\n",
  );
});
