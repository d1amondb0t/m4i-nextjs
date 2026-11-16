import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type {
  IndicatorPipelineResult,
  IndicatorRunSummary,
} from "@/types/indicator-types";

const RESULTS_DIR = "experiments/political-indicators/results";

function resultsDirectory(): string {
  return resolve(/*turbopackIgnore: true*/ RESULTS_DIR);
}

export async function listSavedIndicatorRuns() {
  const directory = resultsDirectory();
  const variants = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  );
  const runs: { variant: string; files: string[] }[] = [];

  for (const variant of variants.filter((entry) => entry.isDirectory())) {
    const files = (await readdir(join(directory, variant.name)))
      .filter((name) => name.endsWith(".json") && !name.endsWith(".raw.json"))
      .map((name) => name.slice(0, -".json".length))
      .sort();
    runs.push({ variant: variant.name, files });
  }
  return runs.sort((a, b) => a.variant.localeCompare(b.variant));
}

export async function readSavedIndicatorRun(
  variant: string,
  file: string,
): Promise<IndicatorRunSummary & IndicatorPipelineResult> {
  const known = (await listSavedIndicatorRuns()).find(
    (run) => run.variant === variant,
  );
  if (!known?.files.includes(file)) {
    throw new Error(`No saved run for ${variant} / ${file}.`);
  }

  const saved = JSON.parse(
    await readFile(join(resultsDirectory(), variant, `${file}.json`), "utf8"),
  );
  if (saved.error) {
    throw new Error(`This run failed: ${saved.error}`);
  }
  return saved;
}
