import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolve } from "node:path";
import { it } from "vitest";

import {
  evidenceIsGrounded,
  parseFrameworkOntology,
} from "@/app/server/rag/hierarchy/hierarchy-helper";
import { OllamaHierarchyAnalyzer } from "@/app/server/rag/hierarchy/ollama-hierarchy-analyzer";
import {
  groundedEvidence,
  resultsMap,
} from "@/app/server/rag/indicators/indicator-helper";
import { createOllamaClient } from "@/app/server/rag/ollama/ollama-client-helper";
import { DEFAULT_HIERARCHY_CONFIGURATION } from "@/types/hierarchy-types";
import {
  cachePath,
  experimentConfiguration,
  RESULTS_DIR,
  ROOT_DIR,
  selectedCases,
  type CachedCase,
} from "./harness-helper";

it("compares strict and relaxed grounding of hierarchy matches", async () => {
  const configuration = experimentConfiguration();
  const ontology = parseFrameworkOntology(
    JSON.parse(
      await readFile(
        path.join(ROOT_DIR, "ontology-political-test.json"),
        "utf8",
      ),
    ),
  );
  const analyzer = new OllamaHierarchyAnalyzer(
    configuration.generation.model,
    resolve("prompts/hierarchy-extract.txt"),
    DEFAULT_HIERARCHY_CONFIGURATION.maxContextWords,
    DEFAULT_HIERARCHY_CONFIGURATION.analyzerContextTokens,
    createOllamaClient(configuration.ollamaHost),
  );
  const rows: Record<string, unknown>[] = [];

  for (const file of selectedCases()) {
    const cached = JSON.parse(
      await readFile(cachePath(file), "utf8"),
    ) as CachedCase;
    for (const category of cached.hierarchy.retrievals) {
      const frameworkCategory = ontology.dimensions
        .flatMap((dimension) => dimension.categories)
        .find((entry) => entry.id === category.categoryId)!;
      for (const question of category.questions) {
        if (question.results.length === 0) continue;
        const candidates = await analyzer.match(
          frameworkCategory,
          question.question,
          question.results,
        );
        const byId = resultsMap(question.results);
        for (const candidate of candidates) {
          const evidence = candidate.evidence[0];
          const relaxed = groundedEvidence(
            evidence.chunkId,
            evidence.quote,
            byId,
          );
          rows.push({
            file,
            question: question.question,
            strict: evidenceIsGrounded(candidate, byId),
            relaxed: Boolean(relaxed),
            reattributed: Boolean(
              relaxed && relaxed.chunkId !== evidence.chunkId,
            ),
            chunkId: evidence.chunkId,
            quote: evidence.quote,
            reason: candidate.reason,
          });
        }
      }
    }
  }

  await writeFile(
    path.join(RESULTS_DIR, "hierarchy-grounding.json"),
    JSON.stringify(rows, null, 2),
  );
  const count = (key: string) => rows.filter((row) => row[key]).length;
  console.log(
    `candidates ${rows.length}, strict ${count("strict")}, relaxed ${count("relaxed")}, reattributed ${count("reattributed")}`,
  );
});
