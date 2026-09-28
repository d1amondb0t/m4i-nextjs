import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Runner for the calibration harness. Kept separate from vitest.config.mts so
 * `npm test` stays a fast, offline unit-test run: this config talks to live
 * Ollama and Qdrant and takes tens of minutes.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["calibration/**/*.calibration.ts"],
    testTimeout: 6 * 60 * 60_000,
    hookTimeout: 60 * 60_000,
    fileParallelism: false,
  },
});
