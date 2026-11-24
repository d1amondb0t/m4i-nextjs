import path from "node:path";

import {
  DEFAULT_INDICATOR_CONFIGURATION,
  type IndicatorConfiguration,
} from "@/types/indicator-types";
import { EXPERIMENT_DIR, ROOT_DIR } from "./harness-helper";

export type Variant = {
  model: string;
  prompts: { discover: string; answer: string };
  configuration: IndicatorConfiguration;
};

const QWEN = "qwen3.5:9b-q4_K_M";
const GEMMA = "gemma3:12b";

const PRODUCTION_PROMPTS = {
  discover: path.join(ROOT_DIR, "prompts/indicator-discover.txt"),
  answer: path.join(ROOT_DIR, "prompts/indicator-answer.txt"),
};

function prompt(name: string): string {
  return path.join(EXPERIMENT_DIR, "prompts", name);
}

const base: Variant = {
  model: QWEN,
  prompts: PRODUCTION_PROMPTS,
  configuration: DEFAULT_INDICATOR_CONFIGURATION,
};

function withConfiguration(
  overrides: Partial<IndicatorConfiguration>,
  variant: Variant = base,
): Variant {
  return {
    ...variant,
    configuration: { ...variant.configuration, ...overrides },
  };
}

export const VARIANTS: Record<string, Variant> = {
  baseline: base,
  always: withConfiguration({ fallback: "always" }),
  "always-per-indicator": withConfiguration({
    fallback: "always",
    answerBatch: "indicator",
  }),
  "always-gemma": {
    ...withConfiguration({ fallback: "always" }),
    model: GEMMA,
  },
  "always-two-chunks": withConfiguration({
    fallback: "always",
    chunksPerIndicator: 2,
  }),
  "always-no-unknown": {
    ...withConfiguration({ fallback: "always" }),
    prompts: { ...PRODUCTION_PROMPTS, answer: prompt("answer-no-unknown.txt") },
  },
  "always-strict": {
    ...withConfiguration({ fallback: "always" }),
    prompts: { ...PRODUCTION_PROMPTS, answer: prompt("answer-strict.txt") },
  },
  "discover-per-horizon-hint": {
    ...base,
    prompts: {
      ...PRODUCTION_PROMPTS,
      discover: prompt("discover-with-examples.txt"),
    },
  },
};
