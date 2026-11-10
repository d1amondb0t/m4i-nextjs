import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["scripts/benchmark_ontology_batching.test.ts"],
    testTimeout: 6 * 3_600_000,
  },
});
