import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: [
      "scripts/evaluate_app_retrieval.test.ts",
      "scripts/evaluate_rerankers.test.ts",
    ],
    testTimeout: 86_400_000,
  },
});
