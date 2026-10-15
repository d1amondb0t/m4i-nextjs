/** Export the screened 700-PDF corpus with the application's default chunker. */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";

import { DocumentChunker } from "../app/server/rag/chunking/chunk-documents";
import type { DocumentChunk } from "../types/chunk-type";

const root = path.resolve(import.meta.dirname, "..");
const dataset = path.join(root, "dataset");
const output = path.join(root, "calibration", "results", "screened-corpus");
const dimensions = [
  "political",
  "economic",
  "social",
  "environmental",
  "urban_transport",
  "humanitarian_rights",
  "education",
];
const exportVersion = 2;

it("exports all accepted PDFs without OCR through default chunking", async () => {
  await mkdir(output, { recursive: true });
  const chunker = new DocumentChunker();
  const failures: string[] = [];
  let exported = 0;
  let totalChunks = 0;
  const limit = Number(process.env.DATASET_LIMIT || 0);

  for (const dimension of dimensions) {
    const raw = path.join(dataset, dimension, "raw");
    const files = (await readdir(raw))
      .filter((name) => name.endsWith(".pdf"))
      .sort(
        (left, right) =>
          Number(left.match(/-(\d+)\.pdf$/)?.[1]) -
          Number(right.match(/-(\d+)\.pdf$/)?.[1]),
      );
    expect(files).toHaveLength(100);
    for (const name of limit ? files.slice(0, limit) : files) {
      const target = path.join(output, `${name}.json`);
      const bytes = await readFile(path.join(raw, name));
      const sourceHash = createHash("sha256").update(bytes).digest("hex");
      try {
        let chunks: DocumentChunk[];
        try {
          const cached = JSON.parse(await readFile(target, "utf8")) as {
            sourceHash: string;
            exportVersion?: number;
            chunks: DocumentChunk[];
          };
          chunks =
            cached.sourceHash === sourceHash &&
            cached.exportVersion === exportVersion
              ? cached.chunks
              : [];
        } catch {
          chunks = [];
        }
        if (!chunks.length) {
          chunks = await chunker.chunkDocument(new File([bytes], name));
          await writeFile(
            target,
            JSON.stringify({ sourceHash, exportVersion, chunks }),
          );
        }
        if (
          chunks.some(
            (chunk) =>
              chunk.metadata.extractionQuality === "ocr" ||
              (chunk.metadata.quarantinedPages?.length ?? 0) > 0,
          )
        ) {
          failures.push(
            `${name}: OCR or quarantined pages in application extraction`,
          );
        }
        exported += 1;
        totalChunks += chunks.length;
        if (exported % 25 === 0)
          console.log(`Exported ${exported} PDFs, ${totalChunks} chunks`);
      } catch (error) {
        failures.push(`${name}: ${String(error)}`);
      }
    }
  }
  await writeFile(
    path.join(output, "manifest.json"),
    JSON.stringify(
      {
        documents: exported,
        chunks: totalChunks,
        failures,
        chunking: { wordSize: 200, overlapWords: 50 },
      },
      null,
      2,
    ),
  );
  expect(failures).toEqual([]);
});
