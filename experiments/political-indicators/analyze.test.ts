import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { it } from "vitest";

import { hierarchyConfigurationFor } from "@/app/server/rag/hierarchy/hierarchy-helper";
import {
  gateCategories,
  parseIndicatorOntology,
} from "@/app/server/rag/indicators/indicator-helper";
import { IndicatorPipeline } from "@/app/server/rag/indicators/indicator-pipeline";
import { OllamaIndicatorAnalyzer } from "@/app/server/rag/indicators/ollama-indicator-analyzer";
import { createOllamaClient } from "@/app/server/rag/ollama/ollama-client-helper";
import type { SearchResult } from "@/app/server/rag/storage/storage-types";
import {
  cachePath,
  experimentConfiguration,
  RESULTS_DIR,
  ROOT_DIR,
  secondsSince,
  selectedCases,
  type CachedCase,
} from "./harness-helper";
import { VARIANTS } from "./variants";

function trimmedRetrievals(
  retrievals: Record<string, SearchResult[]>,
  chunksPerIndicator: number,
): Map<string, SearchResult[]> {
  return new Map(
    Object.entries(retrievals).map(([id, results]) => [
      id,
      results.slice(0, chunksPerIndicator),
    ]),
  );
}

it("replays the indicator stage for each requested variant", async () => {
  const configuration = experimentConfiguration();
  const ontology = parseIndicatorOntology(
    JSON.parse(
      await readFile(
        path.join(ROOT_DIR, "ontology-political-test.json"),
        "utf8",
      ),
    ),
  );
  const names = (process.env.INDICATOR_VARIANTS ?? "baseline").split(",");
  const client = createOllamaClient(configuration.ollamaHost);
  const exchanges: unknown[] = [];
  const chat = client.chat.bind(client);
  client.chat = (async (request: Parameters<typeof chat>[0]) => {
    const response = await chat({ ...request, stream: false });
    exchanges.push({
      user: request.messages?.at(-1)?.content,
      reply: response.message.content,
      seconds: response.total_duration / 1e9,
    });
    return response;
  }) as typeof client.chat;

  for (const name of names) {
    const variant = VARIANTS[name];
    if (!variant) throw new Error(`Unknown variant ${name}.`);
    const pipeline = new IndicatorPipeline(
      { rankCandidates: async () => [] },
      new OllamaIndicatorAnalyzer(
        variant.model,
        variant.prompts,
        variant.configuration.maxContextWords,
        variant.configuration.analyzerContextTokens,
        client,
      ),
      variant.configuration,
      hierarchyConfigurationFor(configuration.reranking),
    );
    await mkdir(path.join(RESULTS_DIR, name), { recursive: true });

    for (const file of selectedCases()) {
      const cached = JSON.parse(
        await readFile(cachePath(file), "utf8"),
      ) as CachedCase;
      const { gated, skipped } = gateCategories(
        ontology,
        cached.hierarchy.framework,
        variant.configuration.gate,
      );
      exchanges.length = 0;
      const start = performance.now();
      let output: unknown;
      try {
        output = {
          categories: await pipeline.analyze(
            gated,
            trimmedRetrievals(
              cached.indicatorRetrievals,
              variant.configuration.chunksPerIndicator,
            ),
            cached.hierarchy,
          ),
          skippedCategories: skipped,
        };
      } catch (error) {
        output = { error: (error as Error).message };
      }
      const seconds = secondsSince(start);
      await writeFile(
        path.join(RESULTS_DIR, name, `${file}.json`),
        JSON.stringify(
          { variant: name, file, seconds, ...(output as object) },
          null,
          2,
        ),
      );
      await writeFile(
        path.join(RESULTS_DIR, name, `${file}.raw.json`),
        JSON.stringify(exchanges, null, 2),
      );
      console.log(`${name} ${file}: ${seconds}s`);
    }
  }
});
