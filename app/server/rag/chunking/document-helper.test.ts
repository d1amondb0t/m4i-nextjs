import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { DocumentChunker } from "./chunk-documents";
import {
  cleanText,
  extractFile,
  pageQualityReason,
  structurePdfPages,
} from "./document-helper";

const documentChunker = new DocumentChunker();
const chunkDocument = documentChunker.chunkDocument.bind(documentChunker);

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function createPdf(
  pages: readonly (string | null)[],
  name = "sample.pdf",
): Promise<File> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const text of pages) {
    const page = pdf.addPage();
    if (text !== null) {
      page.drawText(text, { x: 40, y: 700, size: 12, font });
    }
  }

  return new File([toArrayBuffer(await pdf.save())], name);
}

describe("cleanText", () => {
  it("C1 collapses repeated spaces", () => {
    expect(cleanText("one    two")).toBe("one two");
  });

  it("C2 collapses tabs and newlines into spaces", () => {
    expect(cleanText("one\t\ttwo\n\nthree")).toBe("one two three");
  });

  it("C3 trims leading and trailing whitespace", () => {
    expect(cleanText("  text  \n")).toBe("text");
  });

  it("C4 replaces NUL characters with spaces", () => {
    expect(cleanText("one\x00two")).toBe("one two");
  });

  it("C5 removes lowercase latexit blocks", () => {
    expect(cleanText("before <latexit>formula</latexit> after")).toBe(
      "before after",
    );
  });

  it("C6 removes mixed-case latexit blocks", () => {
    expect(cleanText("before <LaTeXiT>formula</LATEXIT> after")).toBe(
      "before after",
    );
  });

  it("C7 removes multiline latexit blocks", () => {
    expect(cleanText("before <latexit>\nformula\n</latexit> after")).toBe(
      "before after",
    );
  });

  it("C8 joins hyphenated words across LF", () => {
    expect(cleanText("inter-\nnational")).toBe("international");
  });

  it("C9 joins hyphenated words across CRLF", () => {
    expect(cleanText("inter-\r\nnational")).toBe("international");
  });

  it("C10 preserves intentional same-line hyphens", () => {
    expect(cleanText("state-of-the-art")).toBe("state-of-the-art");
  });

  it("C11 preserves accented and non-Latin characters", () => {
    expect(cleanText("café 東京")).toBe("café 東京");
  });

  it("C12 returns an empty string for whitespace-only input", () => {
    expect(cleanText(" \t\r\n ")).toBe("");
  });

  it("C13 applies multiple cleaning rules together", () => {
    expect(
      cleanText("  inter-\r\nnational\x00 <latexit>x</latexit>  text  "),
    ).toBe("international text");
  });
});

describe("text extraction", () => {
  it("T1 extracts TXT as one page", async () => {
    await expect(
      extractFile(new File(["plain text"], "sample.txt"), "txt"),
    ).resolves.toEqual([{ page: 1, text: "plain text" }]);
  });

  it("T2 cleans extracted TXT", async () => {
    const [page] = await extractFile(
      new File(["  one\x00   two  "], "sample.txt"),
      "txt",
    );
    expect(page.text).toBe("one two");
  });

  it("T3 preserves Unicode TXT", async () => {
    const [page] = await extractFile(
      new File(["café 東京"], "sample.txt"),
      "txt",
    );
    expect(page.text).toBe("café 東京");
  });

  it("T4 handles a UTF-8 BOM", async () => {
    const file = new File(
      [new Uint8Array([0xef, 0xbb, 0xbf]), "hello"],
      "bom.txt",
    );
    await expect(extractFile(file, "txt")).resolves.toEqual([
      { page: 1, text: "hello" },
    ]);
  });

  it("T5 rejects invalid UTF-8 and identifies the file", async () => {
    const file = new File([new Uint8Array([0xc3, 0x28])], "invalid.txt");
    await expect(extractFile(file, "txt")).rejects.toThrow(
      "invalid.txt is not valid UTF-8 text",
    );
  });

  it("T6 extracts an empty page and chunkDocument rejects it", async () => {
    const file = new File([""], "empty.txt");
    await expect(extractFile(file, "txt")).resolves.toEqual([
      { page: 1, text: "" },
    ]);
    await expect(chunkDocument(file)).rejects.toThrow(
      "No text could be extracted from empty.txt",
    );
  });

  it("T7 cleans whitespace-only TXT to empty text", async () => {
    await expect(
      extractFile(new File([" \t\n "], "blank.txt"), "txt"),
    ).resolves.toEqual([{ page: 1, text: "" }]);
  });
});

describe("Markdown extraction", () => {
  it("MD1 extracts Markdown as one page", async () => {
    await expect(
      extractFile(new File(["# Title"], "README.md"), "md"),
    ).resolves.toEqual([{ page: 1, text: "# Title" }]);
  });

  it("MD2 preserves Markdown syntax", async () => {
    const markdown = "# Title\n- item\n[link](https://example.com)\n`code`";
    const [page] = await extractFile(new File([markdown], "README.md"), "md");
    expect(page.text).toBe("# Title - item [link](https://example.com) `code`");
  });

  it("MD3 normalizes whitespace without deleting content", async () => {
    const [page] = await extractFile(
      new File(["##   Heading\n\nparagraph"], "README.md"),
      "md",
    );
    expect(page.text).toBe("## Heading paragraph");
  });

  it("MD4 preserves Unicode", async () => {
    const [page] = await extractFile(
      new File(["# Café 東京"], "README.md"),
      "md",
    );
    expect(page.text).toBe("# Café 東京");
  });

  it("MD5 rejects invalid UTF-8", async () => {
    const file = new File([new Uint8Array([0xc3, 0x28])], "invalid.md");
    await expect(extractFile(file, "md")).rejects.toThrow(
      "invalid.md is not valid UTF-8 text",
    );
  });

  it("MD6 rejects empty Markdown through chunkDocument", async () => {
    await expect(chunkDocument(new File([""], "empty.md"))).rejects.toThrow(
      "No text could be extracted from empty.md",
    );
  });
});

describe("PDF extraction", () => {
  it("P1 extracts a single-page PDF", async () => {
    const pages = await extractFile(await createPdf(["alpha beta"]), "pdf");
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ page: 1 });
    expect(pages[0].text).toContain("alpha beta");
  });

  it("P2 extracts multiple pages in order", async () => {
    const pages = await extractFile(
      await createPdf(["first page", "second page"]),
      "pdf",
    );
    expect(pages.map((page) => page.text)).toEqual([
      expect.stringContaining("first page"),
      expect.stringContaining("second page"),
    ]);
  });

  it("P3 preserves PDF page numbers", async () => {
    const pages = await extractFile(
      await createPdf(["one", "two", "three"]),
      "pdf",
    );
    expect(pages.map((page) => page.page)).toEqual([1, 2, 3]);
  });

  it("P4 cleans every extracted PDF page", async () => {
    const pages = await extractFile(
      await createPdf(["alpha    beta", "gamma    delta"]),
      "pdf",
    );
    expect(pages.map((page) => page.text)).toEqual([
      expect.stringContaining("alpha beta"),
      expect.stringContaining("gamma delta"),
    ]);
    expect(pages.every((page) => page.text === page.text.trim())).toBe(true);
  });

  it("P5 preserves a blank page between populated pages", async () => {
    const pages = await extractFile(
      await createPdf(["first", null, "third"]),
      "pdf",
    );
    expect(pages.map((page) => page.page)).toEqual([1, 2, 3]);
    expect(pages[0].text).toContain("first");
    expect(pages[1].text).toBe("");
    expect(pages[1].quality).toBe("extracted");
    expect(pages[2].text).toContain("third");
  });

  it("P6 extracts empty text from a blank-only PDF", async () => {
    const pages = await extractFile(await createPdf([null, null]), "pdf");
    expect(pages).toHaveLength(2);
    expect(pages.every((page) => page.text === "")).toBe(true);
  });

  it("P7 reports the OCR requirement for a textless PDF", async () => {
    const file = await createPdf([null], "scanned.pdf");
    await expect(chunkDocument(file)).rejects.toThrow(
      "No text could be extracted from scanned.pdf; scanned PDFs require OCR",
    );
  });

  it("P8 rejects malformed PDF bytes", async () => {
    const file = new File(["not a PDF"], "broken.pdf");
    await expect(extractFile(file, "pdf")).rejects.toThrow();
  });

  it("P9 preserves accented PDF text", async () => {
    const [page] = await extractFile(await createPdf(["café déjà vu"]), "pdf");
    expect(page.text).toContain("café déjà vu");
  });
});

describe("structured PDF processing", () => {
  it("keeps captions, table rows, paragraphs, and repeated furniture separate", () => {
    const pages = structurePdfPages([
      {
        page: 1,
        text: "Annual report\n1. Findings\nAccess increased in rural areas.\nTable 1. Participation\nRegion\tYear\tRate\nNorth\t2024\t62%\n1",
        quality: "extracted",
      },
      {
        page: 2,
        text: "Annual report\nMore schools opened.\nReferences\nSmith (2024). Education data.\n2",
        quality: "extracted",
      },
    ]);
    expect(pages[0].blocks?.map((block) => block.type)).toEqual([
      "header",
      "heading",
      "paragraph",
      "caption",
      "table",
      "footer",
    ]);
    expect(pages[0].blocks?.find((block) => block.type === "table")?.text).toBe(
      "Region | Year | Rate\nNorth | 2024 | 62%",
    );
    expect(pages[1].blocks?.map((block) => block.type)).toEqual([
      "header",
      "paragraph",
      "heading",
      "reference",
      "footer",
    ]);
    expect(
      pages[1].blocks?.find((block) => block.type === "reference")?.section,
    ).toBe("References");
  });

  it("tries OCR for an error-only PDF page and records its result", async () => {
    const file = await createPdf(["#NAME?", "Readable original page."]);
    const requested: number[] = [];
    const pages = await extractFile(
      file,
      "pdf",
      async (_parser, pageNumber) => {
        requested.push(pageNumber);
        return "OCR recovered the first page.";
      },
    );
    expect(requested).toEqual([1]);
    expect(pages[0].quality).toBe("ocr");
    expect(pages[0].blocks?.[0].text).toContain("OCR recovered");
    expect(pages[1].quality).toBe("extracted");
  });

  it("quarantines a page that remains unreadable after OCR", async () => {
    const pages = await extractFile(
      await createPdf(["#NAME?", "Readable page."]),
      "pdf",
      async () => "#NAME?",
    );
    expect(pages[0]).toMatchObject({
      page: 1,
      quality: "quarantined",
      text: "",
      blocks: [],
    });
    expect(pages[0].qualityReason).toContain("spreadsheet error");
    expect(pages[1].blocks).toHaveLength(1);
  });

  it("flags conspicuously joined words before chunking", () => {
    expect(
      pageQualityReason(
        "Thisdocumentcontainsmanywordsjoinedwithoutspacesandcannotberead",
      ),
    ).toBe("probable joined words");
  });

  it("does not request OCR for one long identifier on a readable page", () => {
    expect(
      pageQualityReason(
        `This page contains readable prose with many ordinary words and one ${"a".repeat(45)} identifier.`,
      ),
    ).toBeUndefined();
  });

  it("preserves a two-column table rather than folding its rows into prose", () => {
    const [page] = structurePdfPages([
      {
        page: 1,
        text: "Table 2. Enrollment\nYear\tStudents\n2023\t120\n2024\t145",
        quality: "extracted",
      },
    ]);
    expect(page.blocks?.map((block) => block.type)).toEqual([
      "caption",
      "table",
    ]);
    expect(page.blocks?.[1].text).toBe(
      "Year | Students\n2023 | 120\n2024 | 145",
    );
  });

  it("extracts a drawn PDF table as separate readable rows", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage();
    page.drawText("Table 1. Participation", { x: 40, y: 700, size: 12, font });
    for (const [row, cells] of [
      ["Region", "Year", "Rate"],
      ["North", "2024", "62%"],
    ].entries()) {
      cells.forEach((cell, column) =>
        page.drawText(cell, {
          x: 40 + column * 160,
          y: 670 - row * 20,
          size: 12,
          font,
        }),
      );
    }
    const file = new File([toArrayBuffer(await pdf.save())], "table.pdf");
    const [extracted] = await extractFile(file, "pdf");
    expect(
      extracted.blocks?.find((block) => block.type === "caption")?.text,
    ).toBe("Table 1. Participation");
    expect(
      extracted.blocks?.find((block) => block.type === "table")?.text,
    ).toContain("North | 2024 | 62%");
  });
});
