import { readFile } from "node:fs/promises";
import path from "node:path";

import { ragPipelineConfigurationFromEnvironment } from "@/app/server/rag/pipeline/rag-pipeline-helper";
import type { HierarchyPipelineResult } from "@/types/hierarchy-types";
import type { RagPipelineConfiguration } from "@/types/rag-pipeline-type";
import type { SearchResult } from "@/app/server/rag/storage/storage-types";

export const EXPERIMENT_DIR = path.resolve(import.meta.dirname);
export const ROOT_DIR = path.resolve(EXPERIMENT_DIR, "../..");
export const CACHE_DIR = path.join(EXPERIMENT_DIR, "cache");
export const RESULTS_DIR = path.join(EXPERIMENT_DIR, "results");

export const CASES = [
  "participatory-budgeting-evaluation.txt",
  "procurement-transparency-brief.txt",
  "programme-report.txt",
  "river-sediment-note.txt",
  "economic-1.pdf",
  "political-1.pdf",
] as const;

export type CachedCase = {
  file: string;
  hierarchy: HierarchyPipelineResult;
  indicatorRetrievals: Record<string, SearchResult[]>;
  seconds: { hierarchy: number; indicatorRetrieval: number };
};

export function experimentConfiguration(): RagPipelineConfiguration {
  process.env.QDRANT_COLLECTION ||= "political_indicators_exp";
  process.env.RERANKING_RUNTIME ||= "ollama";
  process.env.RERANKING_MODEL ||= "zerank-2-score";
  return ragPipelineConfigurationFromEnvironment();
}

export async function documentFile(name: string): Promise<File> {
  const bytes = await readFile(path.join(EXPERIMENT_DIR, "documents", name));
  return new File([bytes], name, {
    type: name.endsWith(".pdf") ? "application/pdf" : "text/plain",
  });
}

export function cachePath(file: string): string {
  return path.join(CACHE_DIR, `${file}.json`);
}

export function selectedCases(): string[] {
  const filter = process.env.INDICATOR_CASES?.split(",").filter(Boolean);
  return filter?.length ? filter : [...CASES];
}

export function secondsSince(start: number): number {
  return Math.round((performance.now() - start) / 100) / 10;
}
