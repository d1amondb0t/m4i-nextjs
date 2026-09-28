import { describe, expect, it } from "vitest";

import {
  fitAcceptThreshold,
  fitRejectThreshold,
  fitThresholds,
  type LabelledScore,
} from "./threshold-fitting";

const OBSERVATIONS: LabelledScore[] = [
  { score: 0.9, relevant: true },
  { score: 0.8, relevant: true },
  { score: 0.7, relevant: false },
  { score: 0.6, relevant: true },
];

describe("fitAcceptThreshold", () => {
  it("picks the lowest threshold whose accepted set meets the false-accept target", () => {
    // 0.6 and 0.7 both admit the irrelevant 0.7; 0.8 is the first that is clean.
    expect(fitAcceptThreshold(OBSERVATIONS, 0)).toEqual({
      threshold: 0.8,
      observedRate: 0,
      attainable: true,
    });
  });

  it("accepts more evidence when the target tolerates more error", () => {
    expect(fitAcceptThreshold(OBSERVATIONS, 0.3)).toMatchObject({
      threshold: 0.6,
      attainable: true,
    });
  });

  it("reports the target as unattainable when nothing is precise enough", () => {
    const fitted = fitAcceptThreshold([{ score: 0.9, relevant: false }], 0);

    expect(fitted.attainable).toBe(false);
    expect(fitted.threshold).toBeGreaterThanOrEqual(0.9);
  });
});

describe("fitRejectThreshold", () => {
  it("keeps every relevant chunk when no loss is tolerated", () => {
    expect(fitRejectThreshold(OBSERVATIONS, 0)).toEqual({
      threshold: 0.6,
      observedRate: 0,
      attainable: true,
    });
  });

  it("rises to the target quantile of the relevant scores", () => {
    // One of three relevant chunks (0.6) may be lost at 34%.
    expect(fitRejectThreshold(OBSERVATIONS, 0.34)).toMatchObject({
      threshold: 0.8,
      attainable: true,
    });
  });

  it("cannot be fitted without any relevant observation", () => {
    expect(fitRejectThreshold([{ score: 0.5, relevant: false }], 0.1)).toEqual({
      threshold: 0,
      observedRate: 0,
      attainable: false,
    });
  });
});

describe("fitThresholds", () => {
  it("reports both thresholds and the resulting band split", () => {
    const fitted = fitThresholds(OBSERVATIONS, {
      maximumFalseAcceptRate: 0,
      maximumFalseRejectRate: 0,
    });

    expect(fitted.accept.threshold).toBe(0.8);
    expect(fitted.reject.threshold).toBe(0.6);
    expect(fitted.observations).toBe(4);
    expect(fitted.relevantObservations).toBe(3);
    expect(fitted.bands).toEqual({ accept: 0.5, ambiguous: 0.5, reject: 0 });
  });

  it("never lets the reject threshold climb above the accept threshold", () => {
    const fitted = fitThresholds(OBSERVATIONS, {
      maximumFalseAcceptRate: 0,
      maximumFalseRejectRate: 1,
    });

    expect(fitted.reject.threshold).toBeLessThanOrEqual(fitted.accept.threshold);
  });

  it("requires at least one observation", () => {
    expect(() => fitThresholds([])).toThrow(
      "At least one labelled observation is required.",
    );
  });

  it("rejects out-of-range targets", () => {
    expect(() =>
      fitThresholds(OBSERVATIONS, {
        maximumFalseAcceptRate: 1.5,
        maximumFalseRejectRate: 0.1,
      }),
    ).toThrow("maximumFalseAcceptRate must be between 0 and 1.");
  });
});
