/**
 * Corpus preparation for the experiment grid.
 *
 * PDFs are parsed once per chunking variant and cached, because parsing 109
 * documents is the slowest step and all four embedding variants reuse the same
 * cut of the text.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DocumentChunker } from "@/app/server/rag/chunking/chunk-documents";
import type { DocumentChunk } from "@/types/chunk-type";
import { contextHeaderFor, type ChunkingVariant } from "./matrix";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CALIBRATION = dirname(HERE);
export const CORPUS = join(CALIBRATION, "corpus");
export const RESULTS = join(CALIBRATION, "results");
export const EXPERIMENT_RESULTS = join(RESULTS, "experiment");

const CONTEXT_HEADER_PATTERN = /^\[Document:[^\]]*\]\s*/;

export type ManifestEntry = {
  topic: string;
  dimension: string;
  title: string;
  file: string;
};

/** The evidence text, with any retrieval-only context header removed. */
export function chunkBody(text: string): string {
  return text.replace(CONTEXT_HEADER_PATTERN, "");
}

export async function loadManifest(): Promise<ManifestEntry[]> {
  const manifest = JSON.parse(
    await readFile(join(CORPUS, "manifest.json"), "utf8"),
  ) as { documents: ManifestEntry[] };
  const byFile = new Map<string, ManifestEntry>();

  for (const entry of manifest.documents) {
    if (!byFile.has(entry.file) && existsSync(join(CORPUS, entry.file))) {
      byFile.set(entry.file, entry);
    }
  }

  return [...byFile.values()];
}

export type ChunkedCorpus = {
  chunkingId: string;
  chunks: DocumentChunk[];
  documents: number;
  failures: { file: string; reason: string }[];
};

export async function buildCorpus(
  variant: ChunkingVariant,
  log: (message: string) => void,
): Promise<ChunkedCorpus> {
  const cachePath = join(EXPERIMENT_RESULTS, `chunks-${variant.id}.json`);

  if (existsSync(cachePath)) {
    const cached = JSON.parse(await readFile(cachePath, "utf8")) as ChunkedCorpus;
    log(`[corpus ${variant.id}] cached: ${cached.chunks.length} chunks`);
    return cached;
  }

  const manifest = await loadManifest();
  const chunker = new DocumentChunker(variant.configuration);
  const corpus: ChunkedCorpus = {
    chunkingId: variant.id,
    chunks: [],
    documents: 0,
    failures: [],
  };

  for (const [position, entry] of manifest.entries()) {
    try {
      const file = new File(
        [await readFile(join(CORPUS, entry.file))],
        basename(entry.file),
      );
      const chunks = await chunker.chunkDocuments([file]);

      if (variant.contextHeader) {
        for (const chunk of chunks) {
          chunk.text = `${contextHeaderFor(entry.title, chunk.source, chunk.page)} ${chunk.text}`;
        }
      }

      corpus.chunks.push(...chunks);
      corpus.documents += 1;

      if ((position + 1) % 25 === 0) {
        log(`[corpus ${variant.id}] ${position + 1}/${manifest.length} -> ${corpus.chunks.length} chunks`);
      }
    } catch (error) {
      corpus.failures.push({
        file: entry.file,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await writeFile(cachePath, JSON.stringify(corpus));
  log(
    `[corpus ${variant.id}] built: ${corpus.documents} documents, ${corpus.chunks.length} chunks, ${corpus.failures.length} failed`,
  );

  return corpus;
}
