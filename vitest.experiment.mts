import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Runner for the retrieval experiment grid. Separate from both vitest.config.mts
 * (fast unit tests) and vitest.calibration.mts (the single-configuration
 * calibration): this one builds 16 indexes and runs for hours.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["calibration/experiment/**/*.calibration.ts"],
    testTimeout: 12 * 60 * 60_000,
    hookTimeout: 60 * 60_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
