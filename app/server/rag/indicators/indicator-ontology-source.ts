import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { IndicatorOntology } from "@/types/indicator-types";
import { parseIndicatorOntology } from "./indicator-helper";

export const INDICATOR_ONTOLOGY_PATH = "ontology-political-test.json";

export function loadIndicatorOntology(): IndicatorOntology {
  const path = resolve(
    /*turbopackIgnore: true*/ process.env.INDICATOR_ONTOLOGY_PATH?.trim() ||
      INDICATOR_ONTOLOGY_PATH,
  );
  return parseIndicatorOntology(
    JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, "utf8")),
  );
}
