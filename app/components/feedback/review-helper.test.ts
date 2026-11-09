import { describe, expect, it } from "vitest";

import { sameOriginPath } from "./review-helper";

const ORIGIN = "https://m4i.example.ts.net";

describe("sameOriginPath", () => {
  it("keeps a path on this site", () => {
    expect(sameOriginPath("/runs/abc?tab=1#q2", ORIGIN)).toBe(
      "/runs/abc?tab=1#q2",
    );
  });

  it("falls back to the home page without a target", () => {
    expect(sameOriginPath(null, ORIGIN)).toBe("/");
    expect(sameOriginPath("", ORIGIN)).toBe("/");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
  ])("refuses %j, which leaves the site", (next) => {
    expect(sameOriginPath(next, ORIGIN)).toBe("/");
  });
});
