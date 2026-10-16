/**
 * Export the screened 700-PDF corpus with alternative chunk assemblies, extracting
 * each PDF once. Writes calibration/results/chunking-variants/<variant>/ in the
 * same layout as screened-corpus so the benchmark and audit scripts can read it.
 *
 * Variants are named after the chunker revision that produced them: <revision>-page
 * (structured, within a page), <revision>-flow (structured, across pages), and flat
 * (200-word sliding window over each page's text, ignoring structure). Directories
 * from earlier revisions are kept for comparison. Select variants with
 * VARIANTS=v3-page,v3-flow.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";

import { DocumentChunker } from "../app/server/rag/chunking/chunk-documents";
import {
  createHashKeyDocument,
  hashFileSha256,
} from "../app/server/rag/chunking/chunk-helper";
import { extractFile } from "../app/server/rag/chunking/document-helper";
import type { ChunkConfiguration, DocumentChunk } from "../types/chunk-type";

const root = path.resolve(import.meta.dirname, "..");
const dataset = path.join(root, "dataset");
const output = path.join(root, "calibration", "results", "chunking-variants");
const dimensions = [
  "political",
  "economic",
  "social",
  "environmental",
  "urban_transport",
  "humanitarian_rights",
  "education",
];
const exportVersion = 3;
const base = { wordSize: 200, overlapWords: 50 } as const;
const revision = "v4";
const allVariants: Record<string, ChunkConfiguration & { flat?: boolean }> = {
  [`${revision}-page`]: { ...base, assembly: "page" },
  [`${revision}-flow`]: { ...base, assembly: "flow" },
  flat: { ...base, flat: true },
};
const selected = process.env.VARIANTS?.split(",");
const variants = Object.fromEntries(
  Object.entries(allVariants).filter(
    ([name]) => !selected || selected.includes(name),
  ),
);

it("exports every accepted PDF with each chunk assembly", async () => {
  const chunker = new DocumentChunker();
  const totals = Object.fromEntries(
    Object.keys(variants).map((name) => [name, 0]),
  );
  const failures: string[] = [];
  let exported = 0;
  for (const name of Object.keys(variants))
    await mkdir(path.join(output, name), { recursive: true });

  for (const dimension of dimensions) {
    const raw = path.join(dataset, dimension, "raw");
    const files = (await readdir(raw))
      .filter((file) => file.endsWith(".pdf"))
      .sort();
    expect(files).toHaveLength(100);
    for (const name of files) {
      const bytes = await readFile(path.join(raw, name));
      const file = new File([bytes], name);
      const sourceHash = await hashFileSha256(file);
      const targets = Object.keys(variants).map((variant) =>
        path.join(output, variant, `${name}.json`),
      );
      const cached = await Promise.all(
        targets.map(async (target) => {
          try {
            const value = JSON.parse(await readFile(target, "utf8"));
            return value.sourceHash === sourceHash &&
              value.exportVersion === exportVersion
              ? value
              : null;
          } catch {
            return null;
          }
        }),
      );
      try {
        if (cached.some((value) => value === null)) {
          const pages = await extractFile(file, "pdf");
          const identity = {
            documentId: createHashKeyDocument(file, "sha1", sourceHash),
            source: name,
            sourceHash,
          };
          for (const [index, [variant, config]] of Object.entries(
            variants,
          ).entries()) {
            const input = config.flat
              ? pages.map(({ page, text, quality }) => ({
                  page,
                  text,
                  quality,
                }))
              : pages;
            const chunks: DocumentChunk[] = chunker.chunkPages(
              input,
              "pdf",
              config,
              identity,
            );
            if (!chunks.length)
              throw new Error(`${variant} produced no chunks`);
            cached[index] = { sourceHash, exportVersion, chunks };
            await writeFile(targets[index], JSON.stringify(cached[index]));
          }
          if (
            pages.some(
              (page) =>
                page.quality === "ocr" || page.quality === "quarantined",
            )
          )
            failures.push(`${name}: OCR or quarantined pages`);
        }
        Object.keys(variants).forEach((variant, index) => {
          totals[variant] += cached[index].chunks.length;
        });
        exported += 1;
        if (exported % 50 === 0)
          console.log(`Exported ${exported} PDFs`, totals);
      } catch (error) {
        failures.push(`${name}: ${String(error)}`);
      }
    }
  }
  for (const [variant, config] of Object.entries(variants)) {
    await writeFile(
      path.join(output, variant, "manifest.json"),
      JSON.stringify(
        {
          documents: exported,
          chunks: totals[variant],
          failures,
          chunking: config,
          exportVersion,
        },
        null,
        2,
      ),
    );
  }
  console.log("Totals", totals);
  expect(failures).toEqual([]);
});
