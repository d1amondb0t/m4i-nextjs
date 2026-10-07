import { describe, expect, it } from "vitest";

import { POST } from "./route";

async function submit(questions: string, configuration = "{}") {
  const form = new FormData();
  form.append("documents", new File(["content"], "notes.txt"));
  form.append("questions", questions);
  form.append("configuration", configuration);
  const response = await POST(
    new Request("http://localhost/api/calibration", {
      method: "POST",
      body: form,
    }),
  );
  return { status: response.status, body: await response.json() };
}

describe("POST /api/calibration validation", () => {
  it("requires a question array", async () => {
    expect(await submit("{}", "{}")).toMatchObject({
      status: 400,
      body: {
        ok: false,
        message: "questions must be a non-empty array of strings.",
      },
    });
  });

  it("rejects unavailable hybrid retrieval", async () => {
    expect(
      await submit('["What happened?"]', '{"retrieval":{"strategy":"hybrid"}}'),
    ).toMatchObject({
      status: 400,
      body: {
        ok: false,
        message: "Only dense and sparse retrieval are implemented.",
      },
    });
  });
});
