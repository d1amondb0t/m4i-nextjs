import { afterEach, describe, expect, it, vi } from "vitest";

import { createQdrantClient } from "./qdrant-client-helper";

afterEach(() => {
  vi.unstubAllGlobals();
});

function client() {
  return createQdrantClient({ host: "qdrant.test", port: 6333 });
}

describe("createQdrantClient", () => {
  it("names the endpoint, request, collection, and cause when Qdrant is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        new TypeError("fetch failed", {
          cause: new Error("connect ECONNREFUSED 127.0.0.1:6333"),
        }),
      ),
    );

    await expect(client().collectionExists("documents")).rejects.toThrow(
      'Could not reach Qdrant at http://qdrant.test:6333 (collectionExists on collection "documents"): connect ECONNREFUSED 127.0.0.1:6333. Check that Qdrant is running and that QDRANT_URL, or QDRANT_HOST and QDRANT_PORT, are correct.',
    );
  });

  it("reports the status and Qdrant's error for a failed request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () =>
        Response.json(
          {
            status: {
              error: "Not found: Collection `documents` doesn't exist!",
            },
          },
          { status: 404, statusText: "Not Found" },
        ),
      ),
    );

    await expect(client().getCollection("documents")).rejects.toThrow(
      'Qdrant at http://qdrant.test:6333 returned HTTP 404 Not Found (getCollection on collection "documents"): Not found: Collection `documents` doesn\'t exist!',
    );
    await expect(client().getCollection("documents")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("returns successful responses unchanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () =>
          Response.json({ result: { exists: true }, status: "ok", time: 0 }),
        ),
    );

    await expect(client().collectionExists("documents")).resolves.toEqual({
      exists: true,
    });
  });
});
