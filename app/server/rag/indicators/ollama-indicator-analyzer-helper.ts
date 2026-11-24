import type { HierarchyMatch } from "@/types/hierarchy-types";
import {
  OUTCOME_HORIZONS,
  type ExtractedDocumentIndicator,
  type ExtractedIndicatorAnswer,
  type IndicatorCategory,
  type OntologyIndicator,
  type OntologyOutcome,
} from "@/types/indicator-types";
import { isRecord, requireNonEmptyText } from "../hierarchy/hierarchy-helper";

export const MAX_DOCUMENT_INDICATORS = 9;

export const DISCOVERY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["indicators"],
  properties: {
    indicators: {
      type: "array",
      maxItems: MAX_DOCUMENT_INDICATORS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["horizon", "name", "value", "chunkId", "quote"],
        properties: {
          horizon: { type: "string", enum: [...OUTCOME_HORIZONS] },
          name: { type: "string", maxLength: 120 },
          value: { type: "string", maxLength: 160 },
          chunkId: { type: "string" },
          quote: { type: "string", maxLength: 300 },
        },
      },
    },
  },
} as const;

export function answerSchema(indicators: readonly OntologyIndicator[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["answers"],
    properties: {
      answers: {
        type: "array",
        minItems: indicators.length,
        maxItems: indicators.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "indicatorId",
            "basis",
            "answer",
            "rationale",
            "confidence",
            "chunkId",
            "quote",
          ],
          properties: {
            indicatorId: {
              type: "string",
              enum: indicators.map((indicator) => indicator.id),
            },
            basis: {
              type: "string",
              enum: ["reported", "inferred", "unknown"],
            },
            answer: { type: "string", maxLength: 200 },
            rationale: { type: "string", maxLength: 240 },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            chunkId: { type: "string" },
            quote: { type: "string", maxLength: 300 },
          },
        },
      },
    },
  } as const;
}

function categoryPayload({ id, name, definition }: IndicatorCategory) {
  return { id, name, definition };
}

function findingsPayload(matches: readonly HierarchyMatch[]) {
  return matches.map((match) => ({
    question: match.question,
    finding: match.reason,
    quote: match.evidence[0]?.quote ?? "",
  }));
}

function indicatorPayload(indicator: OntologyIndicator) {
  return {
    id: indicator.id,
    question: indicator.question,
    answerType: indicator.answerType,
    ...(indicator.unit ? { unit: indicator.unit } : {}),
    ...(indicator.options ? { options: indicator.options } : {}),
  };
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function discoveryMessage(
  category: IndicatorCategory,
  matches: readonly HierarchyMatch[],
  context: string,
): string {
  return [
    `Category:\n${json(categoryPayload(category))}`,
    `Results chain:\n${json(
      category.outcomes.map(({ horizon, statement }) => ({
        horizon,
        outcome: statement,
      })),
    )}`,
    `Matched findings:\n${json(findingsPayload(matches))}`,
    `Context:\n${context}`,
  ].join("\n\n");
}

export function answerMessage(
  category: IndicatorCategory,
  outcome: OntologyOutcome,
  indicators: readonly OntologyIndicator[],
  matches: readonly HierarchyMatch[],
  context: string,
): string {
  return [
    `Category:\n${json(categoryPayload(category))}`,
    `Outcome (${outcome.horizon}):\n${outcome.statement}`,
    `Matched findings:\n${json(findingsPayload(matches))}`,
    `Indicators:\n${json(indicators.map(indicatorPayload))}`,
    `Context:\n${context}`,
  ].join("\n\n");
}

function parseJsonObject(content: string, label: string) {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `The indicator model returned invalid ${label} JSON (${(error as Error).message}).`,
      { cause: error },
    );
  }
  if (!isRecord(value)) {
    throw new Error(`The indicator model returned a non-object ${label}.`);
  }
  return value;
}

function text(value: unknown, field: string): string {
  return requireNonEmptyText(
    value,
    `The indicator model returned an invalid ${field}.`,
  );
}

function optionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseDiscoveryResponse(
  content: string,
): ExtractedDocumentIndicator[] {
  const value = parseJsonObject(content, "discovery");
  if (!Array.isArray(value.indicators)) {
    throw new Error("The indicator model omitted indicators.");
  }

  return value.indicators.map((indicator) => {
    if (
      !isRecord(indicator) ||
      !OUTCOME_HORIZONS.includes(indicator.horizon as never)
    ) {
      throw new Error("The indicator model returned an invalid indicator.");
    }
    return {
      horizon: indicator.horizon as ExtractedDocumentIndicator["horizon"],
      name: text(indicator.name, "indicator name"),
      value: optionalText(indicator.value) || "no value reported",
      chunkId: optionalText(indicator.chunkId),
      quote: optionalText(indicator.quote),
    };
  });
}

const BASES = ["reported", "inferred", "unknown"] as const;
export const NOT_REPORTED = "not reported";
const CONFIDENCES = ["low", "medium", "high"] as const;

export function parseAnswerResponse(
  content: string,
  indicators: readonly OntologyIndicator[],
): ExtractedIndicatorAnswer[] {
  const value = parseJsonObject(content, "answer");
  if (!Array.isArray(value.answers)) {
    throw new Error("The indicator model omitted answers.");
  }

  const expectedIds = new Set(indicators.map((indicator) => indicator.id));
  const answers = new Map<string, ExtractedIndicatorAnswer>();
  for (const answer of value.answers) {
    if (
      !isRecord(answer) ||
      !expectedIds.has(answer.indicatorId as string) ||
      !BASES.includes(answer.basis as never) ||
      !CONFIDENCES.includes(answer.confidence as never)
    ) {
      throw new Error("The indicator model returned an invalid answer.");
    }
    const indicatorId = answer.indicatorId as string;
    if (answers.has(indicatorId)) continue;
    const answerText = optionalText(answer.answer);
    answers.set(indicatorId, {
      indicatorId,
      basis: answerText
        ? (answer.basis as ExtractedIndicatorAnswer["basis"])
        : "unknown",
      answer: answerText || NOT_REPORTED,
      rationale: optionalText(answer.rationale),
      confidence: answerText
        ? (answer.confidence as ExtractedIndicatorAnswer["confidence"])
        : "low",
      chunkId: optionalText(answer.chunkId),
      quote: optionalText(answer.quote),
    });
  }

  const missing = [...expectedIds].filter((id) => !answers.has(id));
  if (missing.length > 0) {
    throw new Error(
      `The indicator model did not answer ${missing.join(", ")}.`,
    );
  }
  return indicators.map((indicator) => answers.get(indicator.id)!);
}
