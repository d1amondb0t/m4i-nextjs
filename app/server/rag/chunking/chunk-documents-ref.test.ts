import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { chunkDocument } from "./chunk-documents-ref";

const NO_OVERLAP = { wordSize: 4, overlapWords: 0 };

function words(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `word${index + 1}`);
}

function textFile(content: string, name = "sample.txt"): File {
  return new File([content], name);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function createPdf(
  pages: readonly (string | null)[],
  name = "pages.pdf",
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

describe("extension routing", () => {
  it.each(["txt", "md"])("E accepts .%s", async (extension) => {
    await expect(
      chunkDocument(textFile("content", `sample.${extension}`)),
    ).resolves.toHaveLength(1);
  });

  it("E3 accepts PDF", async () => {
    await expect(chunkDocument(await createPdf(["content"]))).resolves.toHaveLength(1);
  });

  it.each(["TXT", "MD"])("E4 accepts uppercase .%s", async (extension) => {
    const [chunk] = await chunkDocument(textFile("content", `sample.${extension}`));
    expect(chunk.metadata.contentType).toBe(extension.toLowerCase());
  });

  it("E4 accepts uppercase PDF", async () => {
    await expect(
      chunkDocument(await createPdf(["content"], "sample.PDF")),
    ).resolves.toHaveLength(1);
  });

  it.each(["csv", "docx", "xlsx", "unknown"])(
    "E rejects unimplemented .%s",
    async (extension) => {
      await expect(
        chunkDocument(textFile("content", `sample.${extension}`)),
      ).rejects.toThrow(`Document type ".${extension}" is not implemented`);
    },
  );

  it("E9 rejects a filename without an extension", async () => {
    await expect(chunkDocument(textFile("content", "README"))).rejects.toThrow(
      "Document type \".readme\" is not implemented",
    );
  });

  it.each(["docx", "xlsx"])(
    "E10 rejects binary .%s before text extraction",
    async (extension) => {
      const file = new File(
        [new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff])],
        `binary.${extension}`,
      );
      await expect(chunkDocument(file)).rejects.toThrow(
        `Document type ".${extension}" is not implemented`,
      );
    },
  );
});

describe("basic word chunking", () => {
  it("B1 chunks one word", async () => {
    const chunks = await chunkDocument(textFile("one"), NO_OVERLAP);
    expect(chunks.map((chunk) => chunk.text)).toEqual(["one"]);
  });

  it("B2 chunks fewer words than wordSize", async () => {
    const chunks = await chunkDocument(textFile("one two three"), NO_OVERLAP);
    expect(chunks.map((chunk) => chunk.text)).toEqual(["one two three"]);
  });

  it("B3 creates one chunk at exactly wordSize", async () => {
    const chunks = await chunkDocument(textFile("one two three four"), NO_OVERLAP);
    expect(chunks.map((chunk) => chunk.text)).toEqual(["one two three four"]);
  });

  it("B4 creates a final chunk at wordSize plus one", async () => {
    const chunks = await chunkDocument(
      textFile("one two three four five"),
      NO_OVERLAP,
    );
    expect(chunks.map((chunk) => chunk.text)).toEqual([
      "one two three four",
      "five",
    ]);
  });

  it("B5 does not create a redundant chunk for exact multiples", async () => {
    const chunks = await chunkDocument(textFile(words(8).join(" ")), NO_OVERLAP);
    expect(chunks).toHaveLength(2);
    expect(chunks[1].text).toBe(words(8).slice(4).join(" "));
  });

  it("B6 creates the correct partial final chunk", async () => {
    const chunks = await chunkDocument(textFile(words(10).join(" ")), NO_OVERLAP);
    expect(chunks.map((chunk) => chunk.metadata.wordCount)).toEqual([4, 4, 2]);
    expect(chunks[2].text).toBe("word9 word10");
  });

  it("B7 chunks a large document", async () => {
    const chunks = await chunkDocument(textFile(words(1000).join(" ")), {
      wordSize: 100,
      overlapWords: 20,
    });
    expect(chunks).toHaveLength(13);
    expect(chunks.at(-1)?.metadata.wordStart).toBe(960);
  });

  it("B8 rejects empty content", async () => {
    await expect(chunkDocument(textFile("", "empty.txt"), NO_OVERLAP)).rejects.toThrow(
      "No text could be extracted from empty.txt",
    );
  });

  it("B9 numbers chunks sequentially from one", async () => {
    const chunks = await chunkDocument(textFile(words(10).join(" ")), NO_OVERLAP);
    expect(chunks.map((chunk) => chunk.number)).toEqual([1, 2, 3]);
  });

  it("B10 records page-relative word starts", async () => {
    const chunks = await chunkDocument(textFile(words(10).join(" ")), NO_OVERLAP);
    expect(chunks.map((chunk) => chunk.metadata.wordStart)).toEqual([0, 4, 8]);
  });

  it("B11 records each chunk's word count", async () => {
    const chunks = await chunkDocument(textFile(words(10).join(" ")), NO_OVERLAP);
    expect(chunks.map((chunk) => chunk.metadata.wordCount)).toEqual([4, 4, 2]);
  });

  it("B12 represents all original words in order", async () => {
    const original = words(10);
    const chunks = await chunkDocument(textFile(original.join(" ")), NO_OVERLAP);
    expect(chunks.flatMap((chunk) => chunk.text.split(" "))).toEqual(original);
  });
});

describe("overlap behavior", () => {
  it("O1 creates adjacent chunks with zero overlap", async () => {
    const chunks = await chunkDocument(textFile(words(8).join(" ")), NO_OVERLAP);
    expect(chunks.map((chunk) => chunk.text)).toEqual([
      "word1 word2 word3 word4",
      "word5 word6 word7 word8",
    ]);
  });

  it("O2 duplicates exactly one boundary word", async () => {
    const chunks = await chunkDocument(textFile(words(7).join(" ")), {
      wordSize: 4,
      overlapWords: 1,
    });
    expect(chunks.map((chunk) => chunk.text)).toEqual([
      "word1 word2 word3 word4",
      "word4 word5 word6 word7",
    ]);
  });

  it("O3 produces exact chunks for typical overlap", async () => {
    const chunks = await chunkDocument(
      textFile("one two three four five six seven"),
      { wordSize: 4, overlapWords: 2 },
    );
    expect(chunks.map((chunk) => chunk.text)).toEqual([
      "one two three four",
      "three four five six",
      "five six seven",
    ]);
  });

  it("O4 terminates with maximum valid overlap", async () => {
    const chunks = await chunkDocument(textFile(words(6).join(" ")), {
      wordSize: 4,
      overlapWords: 3,
    });
    expect(chunks.map((chunk) => chunk.metadata.wordStart)).toEqual([0, 1, 2]);
  });

  it("O5 does not affect a document shorter than wordSize", async () => {
    const chunks = await chunkDocument(textFile("one two three"), {
      wordSize: 5,
      overlapWords: 4,
    });
    expect(chunks.map((chunk) => chunk.text)).toEqual(["one two three"]);
  });

  it("O6 creates no extra chunk for an exact chunk-sized document", async () => {
    const chunks = await chunkDocument(textFile(words(4).join(" ")), {
      wordSize: 4,
      overlapWords: 2,
    });
    expect(chunks).toHaveLength(1);
  });

  it("O7 includes the expected overlap in a partial final chunk", async () => {
    const chunks = await chunkDocument(textFile(words(7).join(" ")), {
      wordSize: 4,
      overlapWords: 2,
    });
    expect(chunks.at(-1)?.text).toBe("word5 word6 word7");
  });

  it("O8 shares exactly overlapWords between adjacent chunks", async () => {
    const overlapWords = 2;
    const chunks = await chunkDocument(textFile(words(12).join(" ")), {
      wordSize: 5,
      overlapWords,
    });

    for (let index = 1; index < chunks.length; index += 1) {
      const previous = chunks[index - 1].text.split(" ");
      const current = chunks[index].text.split(" ");
      expect(previous.slice(-overlapWords)).toEqual(current.slice(0, overlapWords));
    }
  });

  it("O9 does not omit any words", async () => {
    const original = words(12);
    const chunks = await chunkDocument(textFile(original.join(" ")), {
      wordSize: 5,
      overlapWords: 2,
    });
    expect(new Set(chunks.flatMap((chunk) => chunk.text.split(" ")))).toEqual(
      new Set(original),
    );
  });

  it("O10 introduces only the configured overlap", async () => {
    const original = words(12);
    const overlapWords = 2;
    const chunks = await chunkDocument(textFile(original.join(" ")), {
      wordSize: 5,
      overlapWords,
    });
    const reconstructed = chunks.flatMap((chunk, index) => {
      const chunkWords = chunk.text.split(" ");
      return index === 0 ? chunkWords : chunkWords.slice(overlapWords);
    });
    expect(reconstructed).toEqual(original);
  });
});

describe("page-aware chunking", () => {
  it("PG1 chunks each page independently", async () => {
    const chunks = await chunkDocument(
      await createPdf(["one two three four five", "six seven eight nine ten"]),
      { wordSize: 4, overlapWords: 1 },
    );
    expect(chunks.map((chunk) => chunk.page)).toEqual([1, 1, 2, 2]);
  });

  it("PG2 never overlaps across page boundaries", async () => {
    const chunks = await chunkDocument(
      await createPdf(["pageone alpha beta gamma", "pagetwo delta epsilon zeta"]),
      { wordSize: 3, overlapWords: 1 },
    );
    expect(chunks.filter((chunk) => chunk.page === 1).every((chunk) => !chunk.text.includes("pagetwo"))).toBe(true);
    expect(chunks.filter((chunk) => chunk.page === 2).every((chunk) => !chunk.text.includes("pageone"))).toBe(true);
  });

  it("PG3 resets wordStart on every page", async () => {
    const chunks = await chunkDocument(
      await createPdf(["one two three four five", "six seven eight nine ten"]),
      { wordSize: 4, overlapWords: 1 },
    );
    expect(chunks.filter((chunk) => chunk.page === 1).map((chunk) => chunk.metadata.wordStart)).toEqual([0, 3]);
    expect(chunks.filter((chunk) => chunk.page === 2).map((chunk) => chunk.metadata.wordStart)).toEqual([0, 3]);
  });

  it("PG4 continues chunk numbering across pages", async () => {
    const chunks = await chunkDocument(
      await createPdf(["one two three four five", "six seven eight nine ten"]),
      { wordSize: 4, overlapWords: 1 },
    );
    expect(chunks.map((chunk) => chunk.number)).toEqual([1, 2, 3, 4]);
  });

  it("PG5 associates each chunk with its source page", async () => {
    const chunks = await chunkDocument(
      await createPdf(["first alpha", "second beta", "third gamma"]),
      NO_OVERLAP,
    );
    expect(chunks.map((chunk) => chunk.page)).toEqual([1, 2, 3]);
    expect(chunks.map((chunk) => chunk.text)).toEqual([
      expect.stringContaining("first alpha"),
      expect.stringContaining("second beta"),
      expect.stringContaining("third gamma"),
    ]);
  });

  it("PG6 creates no chunks for blank pages", async () => {
    const chunks = await chunkDocument(
      await createPdf(["first", null, "third"]),
      NO_OVERLAP,
    );
    expect(chunks.map((chunk) => chunk.page)).toEqual([1, 3]);
  });

  it("PG7 handles a short page followed by a long page", async () => {
    const chunks = await chunkDocument(
      await createPdf(["short page", words(9).join(" ")]),
      NO_OVERLAP,
    );
    expect(chunks.filter((chunk) => chunk.page === 1)).toHaveLength(1);
    expect(chunks.filter((chunk) => chunk.page === 2)).toHaveLength(3);
  });

  it("PG8 ignores surrounding blank pages without breaking numbering", async () => {
    const chunks = await chunkDocument(
      await createPdf([null, "one two three four five", null]),
      NO_OVERLAP,
    );
    expect(chunks.map((chunk) => chunk.page)).toEqual([2, 2]);
    expect(chunks.map((chunk) => chunk.number)).toEqual([1, 2]);
  });
});

describe("chunk configuration", () => {
  it("V1 accepts a positive integer wordSize", async () => {
    await expect(
      chunkDocument(textFile("one two"), { wordSize: 1, overlapWords: 0 }),
    ).resolves.toHaveLength(2);
  });

  it("V2 accepts zero overlap", async () => {
    const chunks = await chunkDocument(textFile(words(8).join(" ")), NO_OVERLAP);
    expect(chunks).toHaveLength(2);
  });

  it("V3 accepts wordSize minus one overlap", async () => {
    const chunks = await chunkDocument(textFile(words(6).join(" ")), {
      wordSize: 4,
      overlapWords: 3,
    });
    expect(chunks).toHaveLength(3);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "V rejects invalid wordSize %s",
    async (wordSize) => {
      await expect(
        chunkDocument(textFile("content"), { wordSize, overlapWords: 0 }),
      ).rejects.toThrow("wordSize must be a positive integer");
    },
  );

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "V rejects invalid overlapWords %s",
    async (overlapWords) => {
      await expect(
        chunkDocument(textFile("content"), { wordSize: 10, overlapWords }),
      ).rejects.toThrow("overlapWords must be a non-negative integer");
    },
  );

  it("V11 rejects overlap equal to wordSize", async () => {
    await expect(
      chunkDocument(textFile("content"), { wordSize: 10, overlapWords: 10 }),
    ).rejects.toThrow("overlapWords must be strictly smaller than wordSize");
  });

  it("V12 rejects overlap greater than wordSize", async () => {
    await expect(
      chunkDocument(textFile("content"), { wordSize: 10, overlapWords: 11 }),
    ).rejects.toThrow("overlapWords must be strictly smaller than wordSize");
  });

  it("V13 applies the default 200-word size and 50-word overlap", async () => {
    const chunks = await chunkDocument(textFile(words(201).join(" ")));
    expect(chunks.map((chunk) => chunk.metadata.wordStart)).toEqual([0, 150]);
    expect(chunks.map((chunk) => chunk.metadata.wordCount)).toEqual([200, 51]);
  });
});

describe("document and chunk identity", () => {
  it("I1 generates stable IDs for identical inputs", async () => {
    const file = textFile("one two three four five", "stable.txt");
    const first = await chunkDocument(file, NO_OVERLAP);
    const second = await chunkDocument(file, NO_OVERLAP);
    expect(first.map((chunk) => chunk.chunkId)).toEqual(second.map((chunk) => chunk.chunkId));
    expect(first[0].documentId).toBe(second[0].documentId);
  });

  it("I2 changes documentId when content changes", async () => {
    const [first] = await chunkDocument(textFile("first", "same.txt"), NO_OVERLAP);
    const [second] = await chunkDocument(textFile("second", "same.txt"), NO_OVERLAP);
    expect(first.documentId).not.toBe(second.documentId);
  });

  it("I3 changes chunk IDs when content changes", async () => {
    const [first] = await chunkDocument(textFile("first", "same.txt"), NO_OVERLAP);
    const [second] = await chunkDocument(textFile("second", "same.txt"), NO_OVERLAP);
    expect(first.chunkId).not.toBe(second.chunkId);
  });

  it("I4 changes documentId when filename changes", async () => {
    const [first] = await chunkDocument(textFile("same", "first.txt"), NO_OVERLAP);
    const [second] = await chunkDocument(textFile("same", "second.txt"), NO_OVERLAP);
    expect(first.documentId).not.toBe(second.documentId);
  });

  it("I5 treats filename casing as case-insensitive for identity", async () => {
    const [first] = await chunkDocument(textFile("same", "SAMPLE.TXT"), NO_OVERLAP);
    const [second] = await chunkDocument(textFile("same", "sample.txt"), NO_OVERLAP);
    expect(first.documentId).toBe(second.documentId);
  });

  it("I6 gives different positions different chunk IDs", async () => {
    const chunks = await chunkDocument(textFile(words(8).join(" ")), NO_OVERLAP);
    expect(new Set(chunks.map((chunk) => chunk.chunkId)).size).toBe(chunks.length);
  });

  it("I7 changes chunk IDs when wordSize changes", async () => {
    const file = textFile(words(8).join(" "));
    const [first] = await chunkDocument(file, { wordSize: 4, overlapWords: 0 });
    const [second] = await chunkDocument(file, { wordSize: 5, overlapWords: 0 });
    expect(first.chunkId).not.toBe(second.chunkId);
  });

  it("I8 changes chunk IDs when overlap changes", async () => {
    const file = textFile(words(8).join(" "));
    const [first] = await chunkDocument(file, { wordSize: 4, overlapWords: 0 });
    const [second] = await chunkDocument(file, { wordSize: 4, overlapWords: 1 });
    expect(first.chunkId).not.toBe(second.chunkId);
  });

  it("I9 includes the extension in identity", async () => {
    const [txt] = await chunkDocument(textFile("same", "sample.txt"), NO_OVERLAP);
    const [md] = await chunkDocument(textFile("same", "sample.md"), NO_OVERLAP);
    expect(txt.chunkId).not.toBe(md.chunkId);
  });

  it("I10 changes sourceHash when file bytes change", async () => {
    const [first] = await chunkDocument(textFile("first", "same.txt"), NO_OVERLAP);
    const [second] = await chunkDocument(textFile("second", "same.txt"), NO_OVERLAP);
    expect(first.sourceHash).not.toBe(second.sourceHash);
  });

  it("I11 produces a stable fingerprint for identical input", async () => {
    const file = textFile("same content");
    const [first] = await chunkDocument(file, NO_OVERLAP);
    const [second] = await chunkDocument(file, NO_OVERLAP);
    expect(first.metadata.indexFingerprint).toBe(second.metadata.indexFingerprint);
  });

  it("I12 changes the fingerprint when content changes", async () => {
    const [first] = await chunkDocument(textFile("first", "same.txt"), NO_OVERLAP);
    const [second] = await chunkDocument(textFile("second", "same.txt"), NO_OVERLAP);
    expect(first.metadata.indexFingerprint).not.toBe(second.metadata.indexFingerprint);
  });

  it("I13 changes the fingerprint when configuration changes", async () => {
    const file = textFile(words(8).join(" "));
    const [first] = await chunkDocument(file, { wordSize: 4, overlapWords: 0 });
    const [second] = await chunkDocument(file, { wordSize: 5, overlapWords: 0 });
    expect(first.metadata.indexFingerprint).not.toBe(second.metadata.indexFingerprint);
  });
});