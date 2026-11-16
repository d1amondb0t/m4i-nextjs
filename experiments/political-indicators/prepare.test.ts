import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { it } from "vitest";

import { HierarchyPipeline } from "@/app/server/rag/hierarchy/hierarchy-pipeline";
import { hierarchyConfigurationFor } from "@/app/server/rag/hierarchy/hierarchy-helper";
import { IndicatorPipeline } from "@/app/server/rag/indicators/indicator-pipeline";
import {
  parseIndicatorOntology,
  retrievalScopeFor,
} from "@/app/server/rag/indicators/indicator-helper";
import { OllamaEmbedder } from "@/app/server/rag/embeddings/ollama-embedder";
import { createOllamaClient } from "@/app/server/rag/ollama/ollama-client-helper";
import { Retriever } from "@/app/server/rag/retrieval/retrieval";
import { QdrantStore } from "@/app/server/rag/storage/vector-storage";
import { DEFAULT_INDICATOR_CONFIGURATION } from "@/types/indicator-types";
import {
  CACHE_DIR,
  cachePath,
  documentFile,
  experimentConfiguration,
  ROOT_DIR,
  secondsSince,
  selectedCases,
  type CachedCase,
} from "./harness-helper";

it("runs the political hierarchy and every indicator retrieval per document", async () => {
  const configuration = experimentConfiguration();
  const hierarchyConfiguration = hierarchyConfigurationFor(
    configuration.reranking,
  );
  const ontology = parseIndicatorOntology(
    JSON.parse(
      await readFile(
        path.join(ROOT_DIR, "ontology-political-test.json"),
        "utf8",
      ),
    ),
  );
  const client = createOllamaClient(configuration.ollamaHost);
  const retriever = new Retriever(
    new QdrantStore(configuration.storage, configuration.collection),
    new OllamaEmbedder(
      configuration.embeddingModel,
      configuration.embeddingBatchSize,
      configuration.queryPrefix,
      client,
    ),
    { ...configuration.retrieval, topK: hierarchyConfiguration.topKPerQuery },
    { ...configuration.reranking, enabled: true },
    client,
  );
  const indicators = new IndicatorPipeline(
    retriever,
    { discover: async () => [], answer: async () => [] },
    DEFAULT_INDICATOR_CONFIGURATION,
    hierarchyConfiguration,
  );
  const everyCategory = ontology.dimensions.flatMap((dimension) =>
    dimension.categories.map((category) => ({
      dimensionId: dimension.id,
      category,
      matches: [],
      bestRerankerScore: 0,
    })),
  );
  await mkdir(CACHE_DIR, { recursive: true });

  for (const file of selectedCases()) {
    let start = performance.now();
    const hierarchy = await new HierarchyPipeline(
      configuration,
      hierarchyConfiguration,
    ).run([await documentFile(file)], ontology);
    const hierarchySeconds = secondsSince(start);

    start = performance.now();
    const retrievals = await indicators.retrieveIndicators(
      everyCategory,
      retrievalScopeFor(hierarchy.chunks),
    );
    const cached: CachedCase = {
      file,
      hierarchy,
      indicatorRetrievals: Object.fromEntries(retrievals),
      seconds: {
        hierarchy: hierarchySeconds,
        indicatorRetrieval: secondsSince(start),
      },
    };
    await writeFile(cachePath(file), JSON.stringify(cached));
    console.log(
      `${file}: ${hierarchy.chunks.length} chunks, ${hierarchy.framework.dimensions[0].categories
        .map((category) => `${category.id}=${category.matches.length}`)
        .join(" ")} (${JSON.stringify(cached.seconds)})`,
    );
  }
});
