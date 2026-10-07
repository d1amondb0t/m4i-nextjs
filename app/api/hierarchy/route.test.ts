import { describe, expect, it } from "vitest";

import { POST } from "./route";

async function submit(entries: { documents?: File[]; ontology?: string }) {
  const formData = new FormData();

  for (const document of entries.documents ?? []) {
    formData.append("documents", document);
  }

  if (entries.ontology !== undefined) {
    formData.append("ontology", entries.ontology);
  }

  const response = await POST(
    new Request("http://localhost/api/hierarchy", {
      method: "POST",
      body: formData,
    }),
  );

  return {
    response,
    body: (await response.json()) as { ok: boolean; message?: string },
  };
}

describe("POST /api/hierarchy input validation", () => {
  it("requires at least one document", async () => {
    const { body, response } = await submit({ ontology: "{}" });

    expect(response.status).toBe(400);
    expect(body).toEqual({ ok: false, message: "Select at least one document." });
  });

  it("requires an ontology", async () => {
    const { body, response } = await submit({
      documents: [new File(["content"], "notes.txt")],
    });

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      message: "Provide a framework ontology as JSON.",
    });
  });

  it("rejects malformed ontology JSON", async () => {
    const { body, response } = await submit({
      documents: [new File(["content"], "notes.txt")],
      ontology: "{not-json}",
    });

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      message: "Framework ontology must be valid JSON.",
    });
  });
});
