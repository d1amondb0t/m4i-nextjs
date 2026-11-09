import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { FrameworkOntology } from "@/types/hierarchy-types";
import { parseFrameworkOntology } from "../rag/hierarchy/hierarchy-helper";

export function loadOntology(): FrameworkOntology {
  const path = resolve(
    /*turbopackIgnore: true*/ process.env.ONTOLOGY_PATH?.trim() ||
      "ontology.json",
  );
  return parseFrameworkOntology(
    JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, "utf8")),
  );
}
