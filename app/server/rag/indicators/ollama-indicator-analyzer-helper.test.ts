import { describe, expect, it } from "vitest";

import type { OntologyIndicator } from "@/types/indicator-types";
import {
  answerSchema,
  parseAnswerResponse,
  parseDiscoveryResponse,
} from "./ollama-indicator-analyzer-helper";

const indicators: OntologyIndicator[] = [
  { id: "a", name: "A", question: "A?", answerType: "number" },
  { id: "b", name: "B", question: "B?", answerType: "yes_no" },
];

function answer(indicatorId: string, basis = "reported") {
  return {
    indicatorId,
    basis,
    answer: "yes",
    rationale: "Stated.",
    confidence: "high",
    chunkId: "c1",
    quote: "yes",
  };
}

describe("answerSchema", () => {
  it("asks for exactly one answer per indicator", () => {
    const schema = answerSchema(indicators);
    expect(schema.properties.answers.minItems).toBe(2);
    expect(schema.properties.answers.maxItems).toBe(2);
    expect(schema.properties.answers.items.properties.indicatorId.enum).toEqual(
      ["a", "b"],
    );
  });
});

describe("parseAnswerResponse", () => {
  it("returns answers in indicator order and ignores duplicates", () => {
    const parsed = parseAnswerResponse(
      JSON.stringify({
        answers: [answer("b"), answer("a"), answer("a", "unknown")],
      }),
      indicators,
    );
    expect(parsed.map((entry) => [entry.indicatorId, entry.basis])).toEqual([
      ["a", "reported"],
      ["b", "reported"],
    ]);
  });

  it("turns an empty answer into a low-confidence not reported", () => {
    const parsed = parseAnswerResponse(
      JSON.stringify({
        answers: [{ ...answer("a"), answer: " " }, answer("b")],
      }),
      indicators,
    );
    expect(parsed[0]).toMatchObject({
      basis: "unknown",
      answer: "not reported",
      confidence: "low",
    });
  });

  it("fails when an indicator is not answered", () => {
    expect(() =>
      parseAnswerResponse(
        JSON.stringify({ answers: [answer("a")] }),
        indicators,
      ),
    ).toThrow(/did not answer b/);
  });

  it("fails on an unknown basis", () => {
    expect(() =>
      parseAnswerResponse(
        JSON.stringify({ answers: [answer("a", "guessed"), answer("b")] }),
        indicators,
      ),
    ).toThrow(/invalid answer/);
  });
});

describe("parseDiscoveryResponse", () => {
  it("fills in a missing value", () => {
    expect(
      parseDiscoveryResponse(
        JSON.stringify({
          indicators: [
            {
              horizon: "long_term",
              name: "Turnout",
              value: " ",
              chunkId: "c1",
              quote: "q",
            },
          ],
        }),
      ),
    ).toEqual([
      {
        horizon: "long_term",
        name: "Turnout",
        value: "no value reported",
        chunkId: "c1",
        quote: "q",
      },
    ]);
  });

  it("rejects an unknown horizon", () => {
    expect(() =>
      parseDiscoveryResponse(
        JSON.stringify({
          indicators: [
            { horizon: "soon", name: "X", value: "", chunkId: "", quote: "" },
          ],
        }),
      ),
    ).toThrow(/invalid indicator/);
  });
});
