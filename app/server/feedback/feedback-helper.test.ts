import { describe, expect, it } from "vitest";

import { UTF8_BYTE_ORDER_MARK, toCsv } from "./csv-helper";
import {
  MAX_COMMENT_LENGTH,
  allowedVerdicts,
  parseFeedbackRequest,
} from "./feedback-helper";

describe("allowedVerdicts", () => {
  it("accepts or rejects items, and labels chunks by whether they were sent", () => {
    expect(allowedVerdicts({ targetType: "run_item", runId: "r" })).toEqual([
      "accepted",
      "rejected",
    ]);
    expect(
      allowedVerdicts({ targetType: "run_chunk", runId: "r", status: "sent" }),
    ).toEqual(["relevant", "irrelevant"]);
    expect(
      allowedVerdicts({
        targetType: "run_chunk",
        runId: "r",
        status: "below_cutoff",
      }),
    ).toEqual(["should_have_been_used"]);
  });
});

describe("parseFeedbackRequest", () => {
  it("trims the comment and defaults it to empty", () => {
    expect(
      parseFeedbackRequest({
        targetType: "run_item",
        targetId: 3,
        verdict: "rejected",
        comment: "  Wrong year. ",
      }),
    ).toEqual({
      targetType: "run_item",
      targetId: 3,
      verdict: "rejected",
      comment: "Wrong year.",
    });
    expect(
      parseFeedbackRequest({
        targetType: "run_chunk",
        targetId: 1,
        verdict: "relevant",
      }),
    ).toMatchObject({ comment: "" });
  });

  it.each([
    [null, /JSON object/],
    [{ targetType: "run", targetId: 1, verdict: "accepted" }, /targetType/],
    [{ targetType: "run_item", targetId: 0, verdict: "accepted" }, /targetId/],
    [
      { targetType: "run_item", targetId: 1.5, verdict: "accepted" },
      /targetId/,
    ],
    [
      { targetType: "run_item", targetId: 1, verdict: "partially_correct" },
      /verdict/,
    ],
    [
      { targetType: "run_item", targetId: 1, verdict: "accepted", comment: 4 },
      /comment/,
    ],
    [
      {
        targetType: "run_item",
        targetId: 1,
        verdict: "accepted",
        comment: "x".repeat(MAX_COMMENT_LENGTH + 1),
      },
      /characters or fewer/,
    ],
  ])("rejects %j", (input, message) => {
    expect(parseFeedbackRequest(input)).toMatch(message);
  });
});

describe("toCsv", () => {
  it("quotes separators, quotes and new lines, and leaves nulls empty", () => {
    expect(
      toCsv([
        { a: 'say "hi"', b: "x,y", c: null },
        { a: "line\nbreak", b: 0.5, c: undefined },
      ]),
    ).toBe(
      UTF8_BYTE_ORDER_MARK +
        'a,b,c\r\n"say ""hi""","x,y",\r\n"line\nbreak",0.5,\r\n',
    );
  });

  it("neutralises spreadsheet formulas but keeps negative numbers", () => {
    expect(toCsv([{ a: "=HYPERLINK(1)", b: "-0.25", c: "@x" }])).toBe(
      UTF8_BYTE_ORDER_MARK + "a,b,c\r\n'=HYPERLINK(1),-0.25,'@x\r\n",
    );
  });

  it("returns nothing for no rows", () => {
    expect(toCsv([])).toBe("");
  });
});
