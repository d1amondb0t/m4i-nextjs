import { describe, expect, it } from "vitest";

import { conformalThreshold, splitIndices } from "./conformal";
import { parseLoosely, ranksFromPermutation } from "./llm-reranker";

describe("conformalThreshold", () => {
  it("retains at least the requested share of relevant items", () => {
    const scores = Array.from({ length: 99 }, (_, index) => (index + 1) / 100);
    const fitted = conformalThreshold(scores, 0.05);
    const retained = scores.filter((score) => score >= fitted.threshold).length;

    expect(fitted.supported).toBe(true);
    expect(retained / scores.length).toBeGreaterThanOrEqual(0.95);
  });

  it("drops the floor(alpha*(n+1)) smallest positives and no more", () => {
    const scores = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

    // floor(0.2 * 10) = 2 -> threshold is the 2nd smallest score.
    expect(conformalThreshold(scores, 0.2).threshold).toBe(0.2);
  });

  it("reports when the sample is too small to certify the requested alpha", () => {
    const fitted = conformalThreshold([0.4, 0.5, 0.6], 0.05);

    expect(fitted.supported).toBe(false);
    expect(fitted.threshold).toBe(Number.NEGATIVE_INFINITY);
    expect(fitted.smallestSupportedAlpha).toBeCloseTo(0.25, 10);
  });

  it("rejects an alpha outside the open unit interval", () => {
    expect(() => conformalThreshold([0.5], 0)).toThrow(
      "alpha must be strictly between 0 and 1.",
    );
  });

  it("requires at least one positive score", () => {
    expect(() => conformalThreshold([], 0.1)).toThrow(
      "At least one positive score is required to calibrate.",
    );
  });
});

describe("splitIndices", () => {
  it("partitions every index exactly once", () => {
    const { calibration, evaluation } = splitIndices(84);

    expect(calibration.length + evaluation.length).toBe(84);
    expect(new Set([...calibration, ...evaluation]).size).toBe(84);
  });

  it("is deterministic across calls", () => {
    expect(splitIndices(50)).toEqual(splitIndices(50));
  });

  it("honours the requested calibration share", () => {
    expect(splitIndices(100, 0.3).calibration).toHaveLength(30);
  });

  it("rejects a degenerate share", () => {
    expect(() => splitIndices(10, 1)).toThrow(
      "calibrationShare must be strictly between 0 and 1.",
    );
  });
});

describe("ranksFromPermutation", () => {
  it("maps a full permutation onto ranks", () => {
    expect(ranksFromPermutation([3, 1, 2], 3)).toEqual([1, 2, 0]);
  });

  it("appends anything the model omitted, keeping relative order", () => {
    expect(ranksFromPermutation([2], 3)).toEqual([1, 0, 2]);
  });

  it("ignores duplicates and out-of-range identifiers", () => {
    expect(ranksFromPermutation([2, 2, 99, 0, 1], 3)).toEqual([1, 0, 2]);
  });

  it("falls back to the original order for an empty response", () => {
    expect(ranksFromPermutation([], 3)).toEqual([0, 1, 2]);
  });
});

describe("parseLoosely", () => {
  it("parses a well-formed response", () => {
    expect(parseLoosely<{ ranking?: number[] }>('{"ranking":[2,1]}', "ranking")).toEqual({
      ranking: [2, 1],
    });
  });

  it("salvages a truncated ranking rather than throwing", () => {
    // Structured output occasionally comes back cut off mid-array.
    expect(
      parseLoosely<{ ranking?: number[] }>('{"ranking":[3,1,2', "ranking"),
    ).toEqual({ ranking: [3, 1, 2] });
  });

  it("salvages ratings from a malformed response", () => {
    expect(
      parseLoosely<{ ratings?: { passage: number; relevance: number }[] }>(
        '{"ratings":[{"passage":1,"relevance":7},{"passage":2,"relevance":0',
        "ratings",
      ),
    ).toEqual({ ratings: [{ passage: 1, relevance: 7 }, { passage: 2, relevance: 0 }] });
  });

  it("returns null when nothing can be salvaged", () => {
    expect(parseLoosely('total nonsense', "ranking")).toBeNull();
  });
});
