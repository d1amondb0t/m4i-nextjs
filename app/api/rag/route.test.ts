import { describe, expect, it } from "vitest";

import { POST } from "./route";

async function submit(entries: { documents?: File[]; question?: string }) {
  const formData = new FormData();

  for (const document of entries.documents ?? []) {
    formData.append("documents", document);
  }

  if (entries.question !== undefined) {
    formData.append("question", entries.question);
  }

  const response = await POST(
    new Request("http://localhost/api/rag", {
      method: "POST",
      body: formData,
    }),
  );

  return {
    response,
    body: (await response.json()) as { ok: boolean; message?: string },
  };
}

describe("POST /api/rag input validation", () => {
  it("requires at least one document", async () => {
    const { body, response } = await submit({ question: "What is this?" });

    expect(response.status).toBe(400);
    expect(body).toEqual({ ok: false, message: "Select at least one document." });
  });

  it("requires a question", async () => {
    const { body, response } = await submit({
      documents: [new File(["content"], "notes.txt")],
    });

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      message: "Enter a question about the selected documents.",
    });
  });

  it("rejects formats not implemented by the chunker", async () => {
    const { body, response } = await submit({
      documents: [new File(["a,b"], "data.csv")],
      question: "What is in the data?",
    });

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      message:
        "data.csv is accepted for upload, but is not implemented in the RAG chunker yet.",
    });
  });
});
