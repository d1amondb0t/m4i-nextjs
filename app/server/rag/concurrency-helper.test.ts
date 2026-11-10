import { describe, expect, it } from "vitest";

import { mapWithConcurrency } from "./concurrency-helper";

describe("mapWithConcurrency", () => {
  it("keeps input order and never exceeds the limit", async () => {
    let running = 0;
    let peak = 0;
    const results = await mapWithConcurrency(
      [30, 5, 20, 1, 10],
      2,
      async (delay, index) => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, delay));
        running -= 1;
        return index;
      },
    );

    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });

  it("returns an empty list for no items", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});
