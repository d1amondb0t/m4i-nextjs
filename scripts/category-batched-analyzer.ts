/**
 * Experimental analyzer for benchmark_ontology_batching: one LLM call per
 * category covering all of its questions, instead of one call per question.
 * The context is the deduplicated union of the chunks retrieved for those
 * questions. The pipeline still grounds every match against the chunks
 * retrieved for its own question, so cross-question citations are rejected.
 */
import { readFileSync } from "node:fs";
import type { Ollama } from "ollama";

import { buildHierarchyContext } from "../app/server/rag/hierarchy/hierarchy-helper";
import {
  MATCH_SCHEMA,
  parseMatchResponse,
} from "../app/server/rag/hierarchy/ollama-hierarchy-analyzer-helper";
import type { HierarchyAnalyzer } from "../app/server/rag/hierarchy/ollama-hierarchy-analyzer";
import type { SearchResult } from "../app/server/rag/storage/storage-types";
import type {
  ExtractedHierarchyMatch,
  FrameworkCategory,
  QuestionRetrieval,
} from "../types/hierarchy-types";

const BATCH_INSTRUCTIONS = `

Several numbered questions are supplied for the same category. Apply the rules above to each question independently, with up to 20 passages per question. Set questionNumber on every match to the number of the question it supports. Return a passage once per question it supports. Cite only chunks relevant to that question.`;

const MAX_MATCHES_PER_QUESTION = 20;

export type BatchStatistics = {
  categoryId: string;
  questions: number;
  contextChunks: number;
  returnedMatches: number;
  citedOutsideOwnRetrieval: number;
  invalidQuestionNumber: number;
};

function batchSchema(questionCount: number) {
  const item = MATCH_SCHEMA.properties.matches.items;
  return {
    ...MATCH_SCHEMA,
    properties: {
      matches: {
        ...MATCH_SCHEMA.properties.matches,
        maxItems: MAX_MATCHES_PER_QUESTION * questionCount,
        items: {
          ...item,
          required: ["questionNumber", ...item.required],
          properties: {
            questionNumber: {
              type: "integer",
              minimum: 1,
              maximum: questionCount,
            },
            ...item.properties,
          },
        },
      },
    },
  };
}

function unionByBestScore(retrievals: readonly QuestionRetrieval[]) {
  const best = new Map<string, SearchResult>();
  for (const { results } of retrievals) {
    for (const result of results) {
      const current = best.get(result.chunk.chunkId);
      if (!current || result.score > current.score) {
        best.set(result.chunk.chunkId, result);
      }
    }
  }
  return [...best.values()].sort((left, right) => right.score - left.score);
}

export class CategoryBatchedAnalyzer implements HierarchyAnalyzer {
  private readonly prompt: string;
  private readonly batches = new Map<
    string,
    Promise<Map<string, ExtractedHierarchyMatch[]>>
  >();
  retrievals = new Map<string, QuestionRetrieval[]>();
  statistics: BatchStatistics[] = [];

  constructor(
    private readonly model: string,
    promptPath: string,
    private readonly maximumContextWordsPerQuestion: number,
    private readonly contextTokens: number,
    private readonly client: Ollama,
  ) {
    this.prompt = readFileSync(promptPath, "utf8") + BATCH_INSTRUCTIONS;
  }

  async match(
    category: FrameworkCategory,
    question: string,
  ): Promise<ExtractedHierarchyMatch[]> {
    let batch = this.batches.get(category.id);
    if (!batch) {
      batch = this.matchCategory(category);
      this.batches.set(category.id, batch);
    }
    return (await batch).get(question) ?? [];
  }

  private async matchCategory(
    category: FrameworkCategory,
  ): Promise<Map<string, ExtractedHierarchyMatch[]>> {
    const retrievals = this.retrievals
      .get(category.id)!
      .filter(({ results }) => results.length > 0);
    const context = unionByBestScore(retrievals);
    const response = await this.client.chat({
      model: this.model,
      think: false,
      format: batchSchema(retrievals.length),
      messages: [
        { role: "system", content: this.prompt },
        {
          role: "user",
          content: [
            `Category:\n${JSON.stringify(category, null, 2)}`,
            `Questions:\n${retrievals.map(({ question }, index) => `${index + 1}. ${question}`).join("\n")}`,
            `Context:\n${buildHierarchyContext(context, this.maximumContextWordsPerQuestion * retrievals.length)}`,
          ].join("\n\n"),
        },
      ],
      options: { temperature: 0, num_ctx: this.contextTokens },
    });

    const numbers = (
      JSON.parse(response.message.content).matches as {
        questionNumber: number;
      }[]
    ).map((match) => match.questionNumber);
    const matches = parseMatchResponse(response.message.content);
    const byQuestion = new Map<string, ExtractedHierarchyMatch[]>();
    const statistics: BatchStatistics = {
      categoryId: category.id,
      questions: retrievals.length,
      contextChunks: context.length,
      returnedMatches: matches.length,
      citedOutsideOwnRetrieval: 0,
      invalidQuestionNumber: 0,
    };

    matches.forEach((match, index) => {
      const retrieval = retrievals[numbers[index] - 1];
      if (!retrieval) {
        statistics.invalidQuestionNumber += 1;
        return;
      }
      const ownChunks = new Set(
        retrieval.results.map((result) => result.chunk.chunkId),
      );
      if (
        !match.evidence.every((evidence) => ownChunks.has(evidence.chunkId))
      ) {
        statistics.citedOutsideOwnRetrieval += 1;
      }
      const list = byQuestion.get(retrieval.question) ?? [];
      list.push(match);
      byQuestion.set(retrieval.question, list);
    });
    this.statistics.push(statistics);
    return byQuestion;
  }
}
