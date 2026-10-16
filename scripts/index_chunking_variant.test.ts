/**
 * Index one exported chunking variant into its own Qdrant collection with the app's
 * default embedder and QdrantStore, then report what the collection holds.
 *
 * VARIANT: directory under calibration/results/chunking-variants, or "v1" for screened-corpus.
 * COLLECTION: target collection (default rag_chunking_<variant>); recreated on each run.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Ollama } from "ollama";
import { QdrantClient } from "@qdrant/js-client-rest";
import { expect, it } from "vitest";

import { OllamaEmbedder } from "../app/server/rag/embeddings/ollama-embedder";
import { DEFAULT_RAG_PIPELINE_CONFIGURATION } from "../app/server/rag/pipeline/rag-pipeline-helper";
import { QdrantStore } from "../app/server/rag/storage/vector-storage";
import type { DocumentChunk } from "../types/chunk-type";

const root = path.resolve(import.meta.dirname, "..");
const variant = process.env.VARIANT || "v2-flow";
const source =
  variant === "v1"
    ? path.join(root, "calibration", "results", "screened-corpus")
    : path.join(root, "calibration", "results", "chunking-variants", variant);
const collection =
  process.env.COLLECTION || `rag_chunking_${variant.replace(/\W/g, "_")}`;

it(`indexes ${variant} into ${collection}`, async () => {
  const config = DEFAULT_RAG_PIPELINE_CONFIGURATION;
  const client = new QdrantClient(config.storage);
  const store = new QdrantStore(config.storage, collection, client);
  const embedder = new OllamaEmbedder(
    config.embeddingModel,
    32,
    config.queryPrefix,
    new Ollama(),
  );
  const files = (await readdir(source))
    .filter((name) => name.endsWith(".pdf.json"))
    .sort();
  expect(files).toHaveLength(700);

  let indexed = 0;
  let recreated = false;
  for (const [index, name] of files.entries()) {
    const { chunks } = JSON.parse(
      await readFile(path.join(source, name), "utf8"),
    ) as {
      chunks: DocumentChunk[];
    };
    const vectors = await embedder.embed(chunks.map((chunk) => chunk.text));
    if (!recreated) {
      await store.ensureCollection(vectors[0].length, true);
      recreated = true;
    }
    await store.upsert(chunks, vectors);
    indexed += chunks.length;
    if ((index + 1) % 50 === 0)
      console.log(`${index + 1} documents, ${indexed} chunks`);
  }

  // Read back word counts from Qdrant payloads.
  const words: number[] = [];
  let offset: string | number | undefined | null = undefined;
  do {
    const page = await client.scroll(collection, {
      limit: 5000,
      with_payload: ["metadata.wordCount"],
      with_vector: false,
      ...(offset !== undefined && offset !== null ? { offset } : {}),
    });
    for (const point of page.points)
      words.push(
        (point.payload as { metadata: { wordCount: number } }).metadata
          .wordCount,
      );
    offset = page.next_page_offset as string | number | null | undefined;
  } while (offset !== undefined && offset !== null);
  words.sort((left, right) => left - right);
  const at = (q: number) =>
    words[Math.min(words.length - 1, Math.floor(q * words.length))];
  const count = (await client.count(collection, { exact: true })).count;
  const summary = {
    variant,
    collection,
    embeddingModel: config.embeddingModel,
    exportedChunks: indexed,
    points: count,
    wordCount: {
      p10: at(0.1),
      p25: at(0.25),
      median: at(0.5),
      p75: at(0.75),
      p90: at(0.9),
      mean: Number(
        (words.reduce((sum, value) => sum + value, 0) / words.length).toFixed(
          1,
        ),
      ),
      atMost25: Number(
        (words.filter((value) => value <= 25).length / words.length).toFixed(4),
      ),
    },
  };
  console.log(JSON.stringify(summary));
  await writeFile(
    path.join(
      root,
      "calibration",
      "results",
      "chunking-variants",
      `qdrant-${collection}.json`,
    ),
    JSON.stringify(summary, null, 2) + "\n",
  );
  expect(count).toBe(indexed);
});
