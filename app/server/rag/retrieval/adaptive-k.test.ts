import { describe, expect, it } from "vitest";

import type { DocumentChunk } from "@/types/chunk-type";
import type { AdaptiveRetrievalConfiguration } from "@/types/retrieval-types";
import type { SearchResult } from "../storage/storage-types";
import { adaptiveSelect, validateAdaptiveConfiguration } from "./adaptive-k";

const BASE: AdaptiveRetrievalConfiguration = {
  acceptThreshold: 0.8,
  rejectThreshold: 0.2,
  minimumK: 1,
  maximumK: 5,
  relativeDropoff: 0.5,
};

function results(...scores: number[]): SearchResult[] {
  return scores.map((score, index) => ({
    chunk: {
      chunkId: `chunk-${index}`,
      documentId: "document-1",
      source: "report.pdf",
      sourceHash: "hash",
      page: 1,
      number: index + 1,
      text: `passage ${index}`,
      metadata: {
        contentType: "pdf",
        indexFingerprint: "fingerprint",
        wordCount: 2,
      },
    } satisfies DocumentChunk,
    score,
    denseScore: score,
    sparseScore: null,
  }));
}

const scoresOf = (selection: { selected: SearchResult[] }) =>
  selection.selected.map(({ score }) => score);

describe("adaptiveSelect", () => {
  it("accepts and sets k to the number of candidates clearing the accept threshold", () => {
    const selection = adaptiveSelect(results(0.9, 0.85, 0.4, 0.1), BASE);

    expect(selection.decision).toBe("accept");
    expect(selection.k).toBe(2);
    expect(selection.aboveAccept).toBe(2);
    expect(scoresOf(selection)).toEqual([0.9, 0.85]);
  });

  it("is ambiguous when nothing clears accept but the top clears reject", () => {
    const selection = adaptiveSelect(results(0.5, 0.45, 0.3, 0.05), BASE);

    expect(selection.decision).toBe("ambiguous");
    expect(selection.aboveAccept).toBe(0);
    expect(selection.k).toBe(3);
  });

  it("rejects and selects nothing when no candidate clears the reject threshold", () => {
    const selection = adaptiveSelect(results(0.15, 0.05), BASE);

    expect(selection.decision).toBe("reject");
    expect(selection.k).toBe(0);
    expect(selection.selected).toEqual([]);
  });

  it("rejects an empty candidate list", () => {
    expect(adaptiveSelect([], BASE)).toMatchObject({ decision: "reject", k: 0 });
  });

  it("trims the tail once scores fall past the relative drop-off", () => {
    // Four candidates clear reject, but 0.3 is below 0.5 x the 0.8 top score.
    const selection = adaptiveSelect(results(0.8, 0.75, 0.3, 0.25), {
      ...BASE,
      acceptThreshold: 0.9,
    });

    expect(selection.decision).toBe("ambiguous");
    expect(selection.aboveReject).toBe(4);
    expect(selection.k).toBe(2);
  });

  it("clamps k up to minimumK, but never past the candidates available", () => {
    const selection = adaptiveSelect(results(0.9, 0.1), { ...BASE, minimumK: 3 });

    expect(selection.k).toBe(2);
    expect(selection.selected).toHaveLength(2);
  });

  it("clamps k down to maximumK", () => {
    const selection = adaptiveSelect(results(0.99, 0.98, 0.97, 0.96, 0.95, 0.94, 0.93), BASE);

    expect(selection.aboveAccept).toBe(7);
    expect(selection.k).toBe(5);
  });

  it("ranks candidates before selecting", () => {
    const selection = adaptiveSelect(results(0.4, 0.95, 0.85), BASE);

    expect(selection.topScore).toBe(0.95);
    expect(scoresOf(selection)).toEqual([0.95, 0.85]);
  });
});

describe("validateAdaptiveConfiguration", () => {
  it("requires the reject threshold to sit at or below the accept threshold", () => {
    expect(() =>
      validateAdaptiveConfiguration({ ...BASE, rejectThreshold: 0.9 }),
    ).toThrow("rejectThreshold must not exceed acceptThreshold.");
  });

  it("requires a positive minimumK", () => {
    expect(() => validateAdaptiveConfiguration({ ...BASE, minimumK: 0 })).toThrow(
      "minimumK must be a positive integer.",
    );
  });

  it("requires maximumK to be at least minimumK", () => {
    expect(() =>
      validateAdaptiveConfiguration({ ...BASE, minimumK: 4, maximumK: 3 }),
    ).toThrow("maximumK must be an integer greater than or equal to minimumK.");
  });

  it("requires thresholds within the unit interval", () => {
    expect(() =>
      validateAdaptiveConfiguration({ ...BASE, acceptThreshold: 1.2 }),
    ).toThrow("acceptThreshold must be between 0 and 1.");
  });
});
