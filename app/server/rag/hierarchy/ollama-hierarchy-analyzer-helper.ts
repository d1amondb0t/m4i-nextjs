import type { ChatResponse } from "ollama";

import type { ExtractedHierarchyMatch } from "@/types/hierarchy-types";
import { isRecord, requireNonEmptyText } from "./hierarchy-helper";

// The 4,000-word context plus the system prompt is about 6,000 tokens, and a
// full 20-match reply can add about 5,000 more. Without this Ollama uses its
// VRAM-based default (4,096 on a 10 GB GPU) and silently drops part of the
// prompt, which leaves too little room for the reply.
export const HIERARCHY_CONTEXT_TOKENS = 16_384;

const REPLY_ENDING_CHARACTERS = 200;

type ChatCompletion = Pick<
  ChatResponse,
  "model" | "done_reason" | "prompt_eval_count" | "eval_count"
>;

export function requireCompleteResponse(response: ChatCompletion): void {
  if (response.done_reason !== "length") return;

  throw new Error(
    `The hierarchy model ${response.model} stopped at its token limit before finishing its reply ` +
      `(${response.prompt_eval_count} prompt tokens, ${response.eval_count} reply tokens, ` +
      `context ${HIERARCHY_CONTEXT_TOKENS} tokens).`,
  );
}

function describeReplyEnding(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "The reply was empty.";

  return `The reply ends with: ${JSON.stringify(trimmed.slice(-REPLY_ENDING_CHARACTERS))}`;
}

export const MATCH_SCHEMA = {
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

export function parseMatchResponse(content: string): ExtractedHierarchyMatch[] {
  let value: unknown;

  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `The hierarchy model returned invalid JSON (${(error as Error).message}). ${describeReplyEnding(content)}`,
      { cause: error },
    );
  }

  if (!isRecord(value) || !Array.isArray(value.matches)) {
    throw new Error("The hierarchy model omitted matches.");
  }

  return value.matches.map((match) => {
    if (
      !isRecord(match) ||
      !Array.isArray(match.evidence) ||
      match.evidence.length === 0
    ) {
      throw new Error("The hierarchy model returned a match without evidence.");
    }

    if (
      match.explicitness !== "explicit" &&
      match.explicitness !== "implicit"
    ) {
      throw new Error(
        "The hierarchy model returned an invalid match explicitness.",
      );
    }

    return {
      explicitness: match.explicitness,
      reason: requireNonEmptyText(
        match.reason,
        "The hierarchy model returned an invalid match reason.",
      ),
      evidence: match.evidence.map((evidence) => {
        if (!isRecord(evidence)) {
          throw new Error(
            "The hierarchy model returned invalid match evidence.",
          );
        }

        return {
          chunkId: requireNonEmptyText(
            evidence.chunkId,
            "The hierarchy model returned an invalid evidence chunkId.",
          ),
          quote: requireNonEmptyText(
            evidence.quote,
            "The hierarchy model returned an invalid evidence quote.",
          ),
        };
      }),
    };
  });
}
