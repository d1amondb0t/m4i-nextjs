import { readFileSync } from "node:fs";
import type { Ollama } from "ollama";

import type {
  ExtractedHierarchyCandidate,
  FrameworkCategory,
  HierarchyValidation,
} from "@/types/hierarchy-types";
import type { SearchResult } from "../storage/storage-types";
import { buildHierarchyContext } from "./hierarchy-helper";

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "text", "explicitness", "evidence"],
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["outcome", "indicator"] },
          text: { type: "string" },
          explicitness: { type: "string", enum: ["explicit", "derived"] },
          evidence: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["chunkId", "quote"],
              properties: {
                chunkId: { type: "string" },
                quote: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

const VALIDATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["assessments"],
  properties: {
    assessments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "candidateId",
          "categoryFit",
          "typeFit",
          "evidenceSupport",
          "specificity",
          "reason",
        ],
        properties: {
          candidateId: { type: "string" },
          categoryFit: { type: "number", minimum: 0, maximum: 1 },
          typeFit: { type: "number", minimum: 0, maximum: 1 },
          evidenceSupport: { type: "number", minimum: 0, maximum: 1 },
          specificity: { type: "number", minimum: 0, maximum: 1 },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObject(content: string, stage: string): Record<string, unknown> {
  let value: unknown;

  try {
    value = JSON.parse(content);
  } catch {
    throw new Error(`The hierarchy ${stage} model returned invalid JSON.`);
  }

  if (!isRecord(value)) {
    throw new Error(`The hierarchy ${stage} model returned a non-object response.`);
  }

  return value;
}

function text(value: unknown, location: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`The hierarchy model returned an invalid ${location}.`);
  }

  return value.trim();
}

function score(value: unknown, location: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`The hierarchy model returned an invalid ${location} score.`);
  }

  return value;
}

export function parseExtractionResponse(content: string): ExtractedHierarchyCandidate[] {
  const value = parseJsonObject(content, "extraction");

  if (!Array.isArray(value.candidates)) {
    throw new Error("The hierarchy extraction model omitted candidates.");
  }

  const ids = new Set<string>();

  if (value.candidates.length > 20) {
    throw new Error("The hierarchy extraction model returned more than 20 candidates.");
  }

  return value.candidates.map((candidate, candidateIndex) => {
    if (!isRecord(candidate) || !Array.isArray(candidate.evidence)) {
      throw new Error(`The hierarchy model returned an invalid candidate ${candidateIndex}.`);
    }

    const id = text(candidate.id, `candidate ${candidateIndex} id`);
    const kind = candidate.kind;
    const explicitness = candidate.explicitness;

    if (ids.has(id)) {
      throw new Error(`The hierarchy model returned duplicate candidate id "${id}".`);
    }
    ids.add(id);

    if (kind !== "outcome" && kind !== "indicator") {
      throw new Error(`The hierarchy model returned an invalid candidate ${id} kind.`);
    }

    if (explicitness !== "explicit" && explicitness !== "derived") {
      throw new Error(
        `The hierarchy model returned an invalid candidate ${id} explicitness.`,
      );
    }

    return {
      id,
      kind,
      explicitness,
      text: text(candidate.text, `candidate ${id} text`),
      evidence: candidate.evidence.map((evidence, evidenceIndex) => {
        if (!isRecord(evidence)) {
          throw new Error(
            `The hierarchy model returned invalid evidence ${evidenceIndex} for ${id}.`,
          );
        }

        return {
          chunkId: text(evidence.chunkId, `candidate ${id} evidence chunkId`),
          quote: text(evidence.quote, `candidate ${id} evidence quote`),
        };
      }),
    };
  });
}

export function parseValidationResponse(content: string): HierarchyValidation[] {
  const value = parseJsonObject(content, "validation");

  if (!Array.isArray(value.assessments)) {
    throw new Error("The hierarchy validation model omitted assessments.");
  }

  const ids = new Set<string>();

  return value.assessments.map((assessment, index) => {
    if (!isRecord(assessment)) {
      throw new Error(`The hierarchy model returned an invalid assessment ${index}.`);
    }

    const candidateId = text(assessment.candidateId, `assessment ${index} candidateId`);

    if (ids.has(candidateId)) {
      throw new Error(
        `The hierarchy model returned duplicate assessment for "${candidateId}".`,
      );
    }
    ids.add(candidateId);

    return {
      candidateId,
      categoryFit: score(assessment.categoryFit, `${candidateId} categoryFit`),
      typeFit: score(assessment.typeFit, `${candidateId} typeFit`),
      evidenceSupport: score(
        assessment.evidenceSupport,
        `${candidateId} evidenceSupport`,
      ),
      specificity: score(assessment.specificity, `${candidateId} specificity`),
      reason: text(assessment.reason, `${candidateId} reason`),
    };
  });
}

export type HierarchyAnalyzer = {
  extract(
    category: FrameworkCategory,
    results: readonly SearchResult[],
  ): Promise<ExtractedHierarchyCandidate[]>;
  validate(
    category: FrameworkCategory,
    candidates: readonly ExtractedHierarchyCandidate[],
    results: readonly SearchResult[],
  ): Promise<HierarchyValidation[]>;
};

export class OllamaHierarchyAnalyzer implements HierarchyAnalyzer {
  private readonly extractionPrompt: string;
  private readonly validationPrompt: string;

  constructor(
    private readonly model: string,
    extractionPromptPath: string,
    validationPromptPath: string,
    private readonly maximumContextWords: number,
    private readonly client: Ollama,
  ) {
    this.extractionPrompt = readFileSync(extractionPromptPath, "utf8");
    this.validationPrompt = readFileSync(validationPromptPath, "utf8");
  }

  async extract(
    category: FrameworkCategory,
    results: readonly SearchResult[],
  ): Promise<ExtractedHierarchyCandidate[]> {
    const response = await this.client.chat({
      model: this.model,
      think: false,
      format: EXTRACTION_SCHEMA,
      messages: [
        { role: "system", content: this.extractionPrompt },
        {
          role: "user",
          content: [
            `Category:\n${JSON.stringify(category, null, 2)}`,
            `Context:\n${buildHierarchyContext(results, this.maximumContextWords)}`,
          ].join("\n\n"),
        },
      ],
      options: { temperature: 0 },
    });

    return parseExtractionResponse(response.message.content);
  }

  async validate(
    category: FrameworkCategory,
    candidates: readonly ExtractedHierarchyCandidate[],
    results: readonly SearchResult[],
  ): Promise<HierarchyValidation[]> {
    if (candidates.length === 0) return [];

    const response = await this.client.chat({
      model: this.model,
      think: false,
      format: VALIDATION_SCHEMA,
      messages: [
        { role: "system", content: this.validationPrompt },
        {
          role: "user",
          content: [
            `Category:\n${JSON.stringify(category, null, 2)}`,
            `Candidates:\n${JSON.stringify(candidates, null, 2)}`,
            `Context:\n${buildHierarchyContext(results, this.maximumContextWords)}`,
          ].join("\n\n"),
        },
      ],
      options: { temperature: 0 },
    });

    return parseValidationResponse(response.message.content);
  }
}
