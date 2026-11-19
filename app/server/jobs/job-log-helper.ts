import type { Job } from "@/types/feedback-types";
import type { PipelineProgress, PipelineStage } from "@/types/progress-types";

export type StageLogger = {
  progress: PipelineProgress;
  currentStage: () => PipelineStage | null;
  elapsedSeconds: () => number;
};

function secondsBetween(start: number, end: number): number {
  return Math.round((end - start) / 100) / 10;
}

export function stageLogger(
  job: Pick<Job, "id" | "mode">,
  log: (message: string) => void,
  update: PipelineProgress,
  clock: () => number = () => performance.now(),
): StageLogger {
  const startedAt = clock();
  let current: { stage: PipelineStage; startedAt: number } | null = null;

  return {
    progress(stage, done, total) {
      update(stage, done, total);
      if (current?.stage === stage) return;

      const at = clock();
      if (current) {
        log(
          `Job ${job.id} finished ${current.stage} in ${secondsBetween(current.startedAt, at)}s.`,
        );
      }
      log(`Job ${job.id} (${job.mode}) started ${stage}: ${total} steps.`);
      current = { stage, startedAt: at };
    },
    currentStage: () => current?.stage ?? null,
    elapsedSeconds: () => secondsBetween(startedAt, clock()),
  };
}
