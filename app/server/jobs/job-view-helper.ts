import type { DatabaseSync } from "node:sqlite";

import type { Job, JobView } from "@/types/feedback-types";
import { queuePosition } from "../db/jobs-repository";

export function jobView(db: DatabaseSync, job: Job): JobView {
  return {
    id: job.id,
    mode: job.mode,
    status: job.status,
    stage: job.stage,
    progressDone: job.progressDone,
    progressTotal: job.progressTotal,
    error: job.error,
    runId: job.runId,
    createdAt: job.createdAt,
    queuePosition: queuePosition(db, job),
    documents: job.uploads.map((upload) => upload.name),
  };
}
