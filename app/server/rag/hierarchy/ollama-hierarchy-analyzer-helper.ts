import type { ExtractedHierarchyMatch } from "@/types/hierarchy-types";
import { isRecord, requireNonEmptyText } from "./hierarchy-helper";

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
  } catch {
    throw new Error("The hierarchy model returned invalid JSON.");
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
