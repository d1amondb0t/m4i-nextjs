import { afterEach, describe, expect, it, vi } from "vitest";

import { createOllamaClient } from "./ollama-client-helper";

afterEach(() => {
  vi.unstubAllGlobals();
});

function generate(host = "http://ollama.test:11434") {
  return createOllamaClient(host).generate({
    model: "zerank-2-score",
    prompt: "question",
    stream: false,
  });
}

describe("createOllamaClient", () => {
  it("names the host, endpoint, model, and cause when Ollama is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        new TypeError("fetch failed", {
          cause: new Error("connect ECONNREFUSED 127.0.0.1:11434"),
        }),
      ),
    );

    await expect(generate()).rejects.toThrow(
      'Could not reach Ollama at http://ollama.test:11434 (/api/generate for model "zerank-2-score"): connect ECONNREFUSED 127.0.0.1:11434. Check that Ollama is running and that OLLAMA_HOST is correct.',
    );
  });

  it("reports the status and Ollama's error for a failed request", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: "model 'zerank-2-score' not found" },
            { status: 404, statusText: "Not Found" },
          ),
        ),
    );

    await expect(generate()).rejects.toThrow(
      `Ollama at http://ollama.test:11434 returned HTTP 404 Not Found (/api/generate for model "zerank-2-score"): model 'zerank-2-score' not found`,
    );
  });

  it("shortens a long error page that is not JSON", async () => {
    const page = `<html>${"x".repeat(10_000)}</html>`;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        async () =>
          new Response(page, {
            status: 502,
            statusText: "Bad Gateway",
            headers: { "content-type": "text/html" },
          }),
      ),
    );

    await expect(generate()).rejects.toThrow(
      `Ollama at http://ollama.test:11434 returned HTTP 502 Bad Gateway (/api/generate for model "zerank-2-score"): ${page.slice(0, 500)}… (${page.length} characters)`,
    );
  });

  it("says when a failed response has no details", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(null, { status: 501, statusText: "Not Implemented" }),
        ),
    );

    await expect(generate()).rejects.toThrow(
      'Ollama at http://ollama.test:11434 returned HTTP 501 Not Implemented (/api/generate for model "zerank-2-score"): the response had no details',
    );
  });

  it("returns successful responses unchanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ response: "Yes", done: true })),
    );

    await expect(generate()).resolves.toMatchObject({ response: "Yes" });
  });
});
