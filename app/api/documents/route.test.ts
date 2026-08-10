import { describe, expect, it } from "vitest";

import {
  ACCEPTED_EXTENSIONS,
  MAX_DOCUMENT_COUNT,
  MAX_DOCUMENT_SIZE_BYTES,
  MAX_DOCUMENT_SIZE_MB,
} from "@/lib/documents/upload-policy";

import { submitDocuments, validDocument } from "./route.test-helpers";

describe("POST /api/documents", () => {
  it("rejects a submission without documents", async () => {
    const { body, response } = await submitDocuments();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      message: "Select at least one document.",
    });
  });

  it.each(ACCEPTED_EXTENSIONS)(
    "accepts a non-empty .%s document",
    async (extension) => {
      const { body, response } = await submitDocuments([
        validDocument(`document.${extension}`),
      ]);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        ok: true,
        message: "1 document received and validated.",
      });
    },
  );

  it("accepts an uppercase supported extension", async () => {
    const { body, response } = await submitDocuments([
      validDocument("REPORT.PDF"),
    ]);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true });
  });

  it("accepts exactly the maximum document count", async () => {
    const documents = Array.from(
      { length: MAX_DOCUMENT_COUNT },
      (_, index) => validDocument(`document-${index + 1}.pdf`),
    );
    const { body, response } = await submitDocuments(documents);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      message: `${MAX_DOCUMENT_COUNT} documents received and validated.`,
    });
  });

  it("rejects more than the maximum document count", async () => {
    const documents = Array.from(
      { length: MAX_DOCUMENT_COUNT + 1 },
      (_, index) => validDocument(`document-${index + 1}.pdf`),
    );
    const { body, response } = await submitDocuments(documents);

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      message: `Select no more than ${MAX_DOCUMENT_COUNT} documents at once.`,
    });
  });

  it("rejects an empty document with a supported extension", async () => {
    const { body, response } = await submitDocuments([
      validDocument("empty.pdf", ""),
    ]);

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      message: "empty.pdf is empty.",
    });
  });

  it("rejects a document with an unsupported extension", async () => {
    const { body, response } = await submitDocuments([
      validDocument("document.exe"),
    ]);

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      message: "document.exe is not a supported document type.",
    });
  });

  it("rejects a document without an extension", async () => {
    const { body, response } = await submitDocuments([
      validDocument("document"),
    ]);

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      message: "document is not a supported document type.",
    });
  });

  it("accepts a document exactly at the maximum file size", async () => {
    const document = validDocument(
      "maximum.pdf",
      new Uint8Array(MAX_DOCUMENT_SIZE_BYTES),
    );
    const { body, response } = await submitDocuments([document]);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true });
  });

  it("rejects a document larger than the maximum file size", async () => {
    const document = validDocument(
      "oversized.pdf",
      new Uint8Array(MAX_DOCUMENT_SIZE_BYTES + 1),
    );
    const { body, response } = await submitDocuments([document]);

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      message: `oversized.pdf exceeds the ${MAX_DOCUMENT_SIZE_MB} MB file limit.`,
    });
  });

  it("accepts multiple valid documents below all limits", async () => {
    const documents = [
      validDocument("research.pdf", "pdf", "application/pdf"),
      validDocument("records.csv", "csv", "text/csv"),
      validDocument(
        "notes.docx",
        "docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ];
    const { body, response } = await submitDocuments(documents);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      message: "3 documents received and validated.",
    });
  });

  it("rejects the full submission when one document is invalid", async () => {
    const { body, response } = await submitDocuments([
      validDocument("valid.pdf"),
      validDocument("invalid.exe"),
      validDocument("also-valid.csv"),
    ]);

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      message: "invalid.exe is not a supported document type.",
    });
  });

  it("returns the submitted document metadata in order", async () => {
    const documents = [
      validDocument("first.pdf", "pdf", "application/pdf"),
      validDocument("second.csv", "csv-data", "text/csv"),
      validDocument("third.md", "markdown", "text/markdown"),
    ];
    const { body, response } = await submitDocuments(documents);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      message: "3 documents received and validated.",
      documents: documents.map((document) => ({
        name: document.name,
        size: document.size,
        type: document.type,
      })),
    });
  });
});
