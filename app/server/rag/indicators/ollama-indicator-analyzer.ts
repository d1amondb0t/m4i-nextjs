import { readFileSync } from "node:fs";
import type { Ollama } from "ollama";

import type { HierarchyMatch } from "@/types/hierarchy-types";
import type {
  ExtractedDocumentIndicator,
  ExtractedIndicatorAnswer,
  IndicatorCategory,
  OntologyIndicator,
  OntologyOutcome,
} from "@/types/indicator-types";
import type { SearchResult } from "../storage/storage-types";
import { buildHierarchyContext } from "../hierarchy/hierarchy-helper";
import { requireCompleteResponse } from "../hierarchy/ollama-hierarchy-analyzer-helper";
import {
  answerMessage,
  answerSchema,
  DISCOVERY_SCHEMA,
  discoveryMessage,
  parseAnswerResponse,
  parseDiscoveryResponse,
} from "./ollama-indicator-analyzer-helper";

export type IndicatorAnalyzer = {
  discover(
    category: IndicatorCategory,
    matches: readonly HierarchyMatch[],
    results: readonly SearchResult[],
  ): Promise<ExtractedDocumentIndicator[]>;
  answer(
    category: IndicatorCategory,
    outcome: OntologyOutcome,
    indicators: readonly OntologyIndicator[],
    matches: readonly HierarchyMatch[],
    results: readonly SearchResult[],
  ): Promise<ExtractedIndicatorAnswer[]>;
};

export type IndicatorPrompts = {
  discover: string;
  answer: string;
};

export class OllamaIndicatorAnalyzer implements IndicatorAnalyzer {
  private readonly discoverPrompt: string;
  private readonly answerPrompt: string;

  constructor(
    private readonly model: string,
    promptPaths: IndicatorPrompts,
    private readonly maximumContextWords: number,
    private readonly contextTokens: number,
    private readonly client: Ollama,
  ) {
    this.discoverPrompt = readFileSync(promptPaths.discover, "utf8");
    this.answerPrompt = readFileSync(promptPaths.answer, "utf8");
  }

  private async chat(
    system: string,
    user: string,
    format: object,
  ): Promise<string> {
    const response = await this.client.chat({
      model: this.model,
      think: false,
      format,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      options: { temperature: 0, num_ctx: this.contextTokens },
    });
    requireCompleteResponse(response, this.contextTokens);
    return response.message.content;
  }

  async discover(
    category: IndicatorCategory,
    matches: readonly HierarchyMatch[],
    results: readonly SearchResult[],
  ): Promise<ExtractedDocumentIndicator[]> {
    const content = await this.chat(
      this.discoverPrompt,
      discoveryMessage(
        category,
        matches,
        buildHierarchyContext(results, this.maximumContextWords),
      ),
      DISCOVERY_SCHEMA,
    );
    return parseDiscoveryResponse(content);
  }

  async answer(
    category: IndicatorCategory,
    outcome: OntologyOutcome,
    indicators: readonly OntologyIndicator[],
    matches: readonly HierarchyMatch[],
    results: readonly SearchResult[],
  ): Promise<ExtractedIndicatorAnswer[]> {
    const content = await this.chat(
      this.answerPrompt,
      answerMessage(
        category,
        outcome,
        indicators,
        matches,
        buildHierarchyContext(results, this.maximumContextWords),
      ),
      answerSchema(indicators),
    );
    return parseAnswerResponse(content, indicators);
  }
}
