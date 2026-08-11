import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { chunkDocument } from "./chunk-documents";

const SMALL_CHUNKS = { sizeWords: 4, overlapWords: 1 };

function toArrayBuffer(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

describe("chunkDocument", () => {
  it("creates stable overlapping chunks for text documents", async () => {
    const document = new File(
      ["one two three four five six seven eight nine ten"],
      "sample.txt",
    );

    const first = await chunkDocument(document, SMALL_CHUNKS);
    const second = await chunkDocument(document, SMALL_CHUNKS);

    expect(first.map((chunk) => chunk.text)).toEqual([
      "one two three four",
      "four five six seven",
      "seven eight nine ten",
    ]);
    expect(first.map((chunk) => chunk.chunkId)).toEqual(
      second.map((chunk) => chunk.chunkId),
    );
    expect(first.every((chunk) => chunk.page === 1)).toBe(true);
  });

  it("keeps CSV records intact and preserves row metadata", async () => {
    const document = new File(
      [
        'id,name,notes\n001,Ada,"quoted, value"\n' +
          '002,Grace,"line one\nline two"\n',
      ],
      "people.csv",
    );

    const chunks = await chunkDocument(document, {
      sizeWords: 20,
      overlapWords: 0,
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toContain("id: 001");
    expect(chunks[0].text).toContain("notes: quoted, value");
    expect(chunks[1].text).toContain("notes: line one line two");
    expect(chunks[0].metadata).toMatchObject({
      contentType: "csv",
      columns: ["id", "name", "notes"],
      rowStart: 1,
      rowEnd: 1,
      delimiter: ",",
      encoding: "utf-8",
    });
  });

  it("detects semicolon CSV files encoded as Windows-1252", async () => {
    const document = new File(
      [Uint8Array.from(Buffer.from("name;city\nAndré;Montréal\n", "latin1"))],
      "cities.csv",
    );

    const [chunk] = await chunkDocument(document, {
      sizeWords: 250,
      overlapWords: 50,
    });

    expect(chunk.text).toContain("name: André");
    expect(chunk.metadata).toMatchObject({
      delimiter: ";",
      encoding: "windows-1252",
    });
  });

  it("extracts and chunks PDF pages", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const firstPage = pdf.addPage();
    const secondPage = pdf.addPage();
    firstPage.drawText("alpha beta gamma delta", { x: 40, y: 700, font });
    secondPage.drawText("epsilon zeta eta theta", { x: 40, y: 700, font });

    const document = new File(
      [toArrayBuffer(await pdf.save())],
      "two-pages.pdf",
    );
    const chunks = await chunkDocument(document, {
      sizeWords: 10,
      overlapWords: 0,
    });

    expect(chunks.map((chunk) => chunk.page)).toEqual([1, 2]);
    expect(chunks[0].text).toContain("alpha beta gamma delta");
    expect(chunks[1].text).toContain("epsilon zeta eta theta");
  });

  it.each(["docx", "xlsx"])(
    "rejects .%s files until that parser is implemented",
    async (extension) => {
      const document = new File(["content"], `document.${extension}`);

      await expect(
        chunkDocument(document, { sizeWords: 250, overlapWords: 50 }),
      ).rejects.toThrow(`Unsupported document type ".${extension}"`);
    },
  );

  it("rejects invalid chunk overlap", async () => {
    const document = new File(["content"], "sample.txt");

    await expect(
      chunkDocument(document, { sizeWords: 10, overlapWords: 10 }),
    ).rejects.toThrow("overlapWords must be smaller than sizeWords");
  });
});
