import { describe, expect, it } from "vitest";

import {
  areaUnderCurve,
  mean,
  ndcgAtK,
  precisionAtK,
  recallAtK,
  reciprocalRank,
} from "./metrics";

describe("precisionAtK", () => {
  it("measures the relevant share of the top k", () => {
    expect(precisionAtK([true, false, true, false], 4)).toBe(0.5);
  });

  it("divides by the window actually returned, not by k", () => {
    expect(precisionAtK([true, false], 5)).toBe(0.5);
  });

  it("is zero for a non-positive k", () => {
    expect(precisionAtK([true], 0)).toBe(0);
  });
});

describe("recallAtK", () => {
  it("measures the share of pooled relevant items recovered", () => {
    expect(recallAtK([true, false, true], 3, 4)).toBe(0.5);
  });

  it("is zero when the pool holds nothing relevant", () => {
    expect(recallAtK([false], 1, 0)).toBe(0);
  });
});

describe("ndcgAtK", () => {
  it("discounts relevant items found further down the ranking", () => {
    // gain = 1/log2(2) + 1/log2(4) = 1.5; ideal = 1/log2(2) + 1/log2(3)
    expect(ndcgAtK([true, false, true], 3, 2)).toBeCloseTo(
      1.5 / (1 + 1 / Math.log2(3)),
      10,
    );
  });

  it("is 1 when every relevant item is ranked first", () => {
    expect(ndcgAtK([true, true, false], 3, 2)).toBeCloseTo(1, 10);
  });

  it("caps the ideal ranking at the pool's relevant count", () => {
    expect(ndcgAtK([true], 10, 1)).toBeCloseTo(1, 10);
  });
});

describe("reciprocalRank", () => {
  it("is the reciprocal of the first relevant rank", () => {
    expect(reciprocalRank([false, false, true])).toBeCloseTo(1 / 3, 10);
  });

  it("is zero when nothing relevant was returned", () => {
    expect(reciprocalRank([false, false])).toBe(0);
  });
});

describe("areaUnderCurve", () => {
  it("is 1 when every relevant item outscores every irrelevant one", () => {
    expect(
      areaUnderCurve([
        { score: 0.9, relevant: true },
        { score: 0.8, relevant: true },
        { score: 0.2, relevant: false },
      ]),
    ).toBe(1);
  });

  it("is 0 when the ordering is exactly inverted", () => {
    expect(
      areaUnderCurve([
        { score: 0.1, relevant: true },
        { score: 0.9, relevant: false },
      ]),
    ).toBe(0);
  });

  it("is 0.5 when every score ties, rather than favouring either class", () => {
    expect(
      areaUnderCurve([
        { score: 0.5, relevant: true },
        { score: 0.5, relevant: false },
        { score: 0.5, relevant: true },
        { score: 0.5, relevant: false },
      ]),
    ).toBe(0.5);
  });

  it("is undefined without both classes present", () => {
    expect(areaUnderCurve([{ score: 1, relevant: true }])).toBeNaN();
  });
});

describe("mean", () => {
  it("is zero for an empty sample rather than NaN", () => {
    expect(mean([])).toBe(0);
  });

  it("averages the sample", () => {
    expect(mean([1, 2, 6])).toBe(3);
  });
});
