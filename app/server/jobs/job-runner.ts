import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Ollama } from "ollama";

import type {
  DocumentRecord,
  Job,
  SnapshotInput,
  User,
} from "@/types/feedback-types";
import type {
  FrameworkOntology,
  HierarchyConfiguration,
  HierarchyPipelineResult,
  HierarchyProgress,
} from "@/types/hierarchy-types";
import type {
  Embedder,
  RagPipelineConfiguration,
  RagPipelineResult,
} from "@/types/rag-pipeline-type";
import {
  documentRecords,
  nearestQuestion,
  ontologyQuestions,
  ontologySnapshotQuestions,
  ragSnapshotQuestions,
  runDocuments,
  type NearestOntologyQuestion,
} from "../feedback/snapshot-helper";
import { OllamaEmbedder } from "../rag/embeddings/ollama-embedder";
import { hierarchyConfigurationFor } from "../rag/hierarchy/hierarchy-helper";
import { HierarchyPipeline } from "../rag/hierarchy/hierarchy-pipeline";
import { RagPipeline } from "../rag/pipeline/rag-pipeline";
import { ragPipelineConfigurationFromEnvironment } from "../rag/pipeline/rag-pipeline-helper";
import { loadOntology } from "./ontology-source";

export const HIERARCHY_PROMPT_PATH = "prompts/hierarchy-extract.txt";

export type JobRunnerDependencies = {
  configuration: () => RagPipelineConfiguration;
  ontology: () => FrameworkOntology;
  ragPipeline: (configuration: RagPipelineConfiguration) => {
    run(
      documents: readonly File[],
      question: string,
      onProgress: HierarchyProgress,
    ): Promise<RagPipelineResult>;
  };
  hierarchyPipeline: (
    configuration: RagPipelineConfiguration,
    hierarchy: HierarchyConfiguration,
  ) => {
    run(
      documents: readonly File[],
      ontology: FrameworkOntology,
      onProgress: HierarchyProgress,
    ): Promise<HierarchyPipelineResult>;
  };
  embedder: (configuration: RagPipelineConfiguration) => Embedder;
  promptHash: (path: string) => string;
};

export type JobRunResult = {
  snapshot: SnapshotInput;
  documents: DocumentRecord[];
};

const ontologyVectors = new Map<string, Promise<number[][]>>();

function hashFile(path: string): string {
  return createHash("sha256")
    .update(readFileSync(resolve(path)))
    .digest("hex");
}

export const DEFAULT_JOB_RUNNER_DEPENDENCIES: JobRunnerDependencies = {
  configuration: ragPipelineConfigurationFromEnvironment,
  ontology: loadOntology,
  ragPipeline: (configuration) => new RagPipeline(configuration),
  hierarchyPipeline: (configuration, hierarchy) =>
    new HierarchyPipeline(configuration, hierarchy),
  embedder: (configuration) =>
    new OllamaEmbedder(
      configuration.embeddingModel,
      configuration.embeddingBatchSize,
      "",
      new Ollama(
        configuration.ollamaHost
          ? { host: configuration.ollamaHost }
          : undefined,
      ),
    ),
  promptHash: hashFile,
};

async function nearestOntologyQuestion(
  question: string,
  configuration: RagPipelineConfiguration,
  dependencies: JobRunnerDependencies,
): Promise<NearestOntologyQuestion> {
  const questions = ontologyQuestions(dependencies.ontology());
  const embedder = dependencies.embedder(configuration);
  const cacheKey = `${configuration.embeddingModel}\n${questions.join("\n")}`;

  if (!ontologyVectors.has(cacheKey)) {
    const vectors = embedder.embed(questions);
    vectors.catch(() => ontologyVectors.delete(cacheKey));
    ontologyVectors.set(cacheKey, vectors);
  }

  const [vectors, [questionVector]] = await Promise.all([
    ontologyVectors.get(cacheKey)!,
    embedder.embed([question.trim()]),
  ]);

  return nearestQuestion(
    questionVector,
    questions.map((text, index) => ({
      question: text,
      vector: vectors[index],
    })),
  );
}

function baseSnapshot(
  job: Job,
  user: User,
  configuration: RagPipelineConfiguration,
  rerankingModel: string,
) {
  return {
    runId: randomUUID(),
    jobId: job.id,
    userId: user.id,
    collection: user.collection,
    mode: job.mode,
    generationModel: configuration.generation.model,
    rerankingModel,
    embeddingModel: configuration.embeddingModel,
  };
}

async function runRag(
  job: Job,
  user: User,
  documents: readonly File[],
  onProgress: HierarchyProgress,
  configuration: RagPipelineConfiguration,
  dependencies: JobRunnerDependencies,
): Promise<JobRunResult> {
  const question = job.question ?? "";
  const result = await dependencies
    .ragPipeline(configuration)
    .run(documents, question, onProgress);
  const nearest = await nearestOntologyQuestion(
    question,
    configuration,
    dependencies,
  );

  return {
    snapshot: {
      ...baseSnapshot(job, user, configuration, result.rerankingModel),
      settings: {
        chunking: configuration.chunking,
        retrieval: configuration.retrieval,
        reranking: configuration.reranking,
        generation: configuration.generation,
        candidateCount: result.candidateCount,
      },
      promptHash: dependencies.promptHash(configuration.generation.prompt),
      documents: runDocuments(result.chunks),
      questions: ragSnapshotQuestions(question, result, nearest),
    },
    documents: documentRecords(result.chunks, user),
  };
}

async function runOntology(
  job: Job,
  user: User,
  documents: readonly File[],
  onProgress: HierarchyProgress,
  configuration: RagPipelineConfiguration,
  dependencies: JobRunnerDependencies,
): Promise<JobRunResult> {
  const ontology = dependencies.ontology();
  const hierarchy = hierarchyConfigurationFor(configuration.reranking);
  const result = await dependencies
    .hierarchyPipeline(configuration, hierarchy)
    .run(documents, ontology, onProgress);

  return {
    snapshot: {
      ...baseSnapshot(job, user, configuration, configuration.reranking.model),
      settings: {
        chunking: configuration.chunking,
        retrieval: configuration.retrieval,
        reranking: configuration.reranking,
        hierarchy,
        generationModel: configuration.generation.model,
      },
      promptHash: dependencies.promptHash(HIERARCHY_PROMPT_PATH),
      documents: runDocuments(result.chunks),
      questions: ontologySnapshotQuestions(ontology, result),
    },
    documents: documentRecords(result.chunks, user),
  };
}

export async function runJob(
  job: Job,
  user: User,
  documents: readonly File[],
  onProgress: HierarchyProgress,
  dependencies: JobRunnerDependencies = DEFAULT_JOB_RUNNER_DEPENDENCIES,
): Promise<JobRunResult> {
  // Every user indexes into and retrieves from their own collection.
  const configuration = {
    ...dependencies.configuration(),
    collection: user.collection,
  };
  const run = job.mode === "rag" ? runRag : runOntology;

  return run(job, user, documents, onProgress, configuration, dependencies);
}
