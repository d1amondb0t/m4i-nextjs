import { readFileSync } from "node:fs";
import type { Ollama } from "ollama";

import type {
  ExtractedHierarchyMatch,
  FrameworkCategory,
} from "@/types/hierarchy-types";
import type { SearchResult } from "../storage/storage-types";
import { buildHierarchyContext } from "./hierarchy-helper";
import {
  analyzerCategory,
  HIERARCHY_CONTEXT_TOKENS,
  MATCH_SCHEMA,
  parseMatchResponse,
  requireCompleteResponse,
} from "./ollama-hierarchy-analyzer-helper";

export type HierarchyAnalyzer = {
  match(
    category: FrameworkCategory,
    question: string,
    results: readonly SearchResult[],
  ): Promise<ExtractedHierarchyMatch[]>;
};

export class OllamaHierarchyAnalyzer implements HierarchyAnalyzer {
  private readonly matchingPrompt: string;

  constructor(
    private readonly model: string,
    promptPath: string,
    private readonly maximumContextWords: number,
    private readonly client: Ollama,
  ) {
    this.matchingPrompt = readFileSync(promptPath, "utf8");
  }

  async match(
    category: FrameworkCategory,
    question: string,
    results: readonly SearchResult[],
  ): Promise<ExtractedHierarchyMatch[]> {
    const response = await this.client.chat({
      model: this.model,
      think: false,
      format: MATCH_SCHEMA,
      messages: [
        { role: "system", content: this.matchingPrompt },
        {
          role: "user",
          content: [
            `Category:\n${JSON.stringify(analyzerCategory(category, question), null, 2)}`,
            `Question:\n${question}`,
            `Context:\n${buildHierarchyContext(results, this.maximumContextWords)}`,
          ].join("\n\n"),
        },
      ],
      options: { temperature: 0, num_ctx: HIERARCHY_CONTEXT_TOKENS },
    });

    requireCompleteResponse(response);
    return parseMatchResponse(response.message.content);
  }
}
