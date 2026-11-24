export const PIPELINE_STAGES = [
  "indexing",
  "retrieving",
  "answering",
  "matching",
  "indicator_retrieval",
  "indicator_analysis",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type PipelineProgress = (
  stage: PipelineStage,
  done: number,
  total: number,
) => void;
