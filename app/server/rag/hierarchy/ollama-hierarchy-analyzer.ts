import { readFileSync } from "node:fs";
import type { Ollama } from "ollama";

import type {
  ExtractedHierarchyMatch,
  FrameworkCategory,
} from "@/types/hierarchy-types";
import type { SearchResult } from "../storage/storage-types";
import { buildHierarchyContext } from "./hierarchy-helper";

const MATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["matches"],
  properties: {
    matches: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["explicitness", "reason", "evidence"],
        properties: {
          explicitness: { type: "string", enum: ["explicit", "implicit"] },
          reason: { type: "string", maxLength: 240 },
          evidence: {
            type: "array",
            minItems: 1,
            maxItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["chunkId", "quote"],
              properties: {
                chunkId: { type: "string" },
                quote: { type: "string", maxLength: 600 },
              },
            },
          },
        },
      },
    },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, location: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`The hierarchy model returned an invalid ${location}.`);
  }

  return value.trim();
}

export function parseMatchResponse(content: string): ExtractedHierarchyMatch[] {
  let value: unknown;

  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("The hierarchy model returned invalid JSON.");
  }

  if (!isRecord(value) || !Array.isArray(value.matches)) {
    throw new Error("The hierarchy model omitted matches.");
  }

  return value.matches.map((match) => {
    if (!isRecord(match) || !Array.isArray(match.evidence) || match.evidence.length === 0) {
      throw new Error("The hierarchy model returned a match without evidence.");
    }

    if (match.explicitness !== "explicit" && match.explicitness !== "implicit") {
      throw new Error("The hierarchy model returned an invalid match explicitness.");
    }

    return {
      explicitness: match.explicitness,
      reason: text(match.reason, "match reason"),
      evidence: match.evidence.map((evidence) => {
        if (!isRecord(evidence)) {
          throw new Error("The hierarchy model returned invalid match evidence.");
        }

        return {
          chunkId: text(evidence.chunkId, "evidence chunkId"),
          quote: text(evidence.quote, "evidence quote"),
        };
      }),
    };
  });
}

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
            `Category:\n${JSON.stringify(category, null, 2)}`,
            `Question:\n${question}`,
            `Context:\n${buildHierarchyContext(results, this.maximumContextWords)}`,
          ].join("\n\n"),
        },
      ],
      options: { temperature: 0 },
    });

    return parseMatchResponse(response.message.content);
  }
}
