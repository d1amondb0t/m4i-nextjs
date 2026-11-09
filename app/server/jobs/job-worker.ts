import type { DatabaseSync } from "node:sqlite";

import type { Job } from "@/types/feedback-types";
import { getDatabase, transaction } from "../db/database";
import { recordDocuments } from "../db/documents-repository";
import {
  claimNextJob,
  completeJob,
  failInterruptedJobs,
  failJob,
  updateJobProgress,
} from "../db/jobs-repository";
import { saveSnapshot } from "../db/runs-repository";
import { findUserById } from "../db/users-repository";
import {
  DEFAULT_JOB_RUNNER_DEPENDENCIES,
  type JobRunnerDependencies,
  runJob,
} from "./job-runner";
import { loadUploads, removeUploads } from "./upload-store";

export type JobWorkerDependencies = {
  db: DatabaseSync;
  runner: JobRunnerDependencies;
  loadUploads: typeof loadUploads;
  removeUploads: typeof removeUploads;
  log: (message: string) => void;
};

// One job at a time: the reranker and the generation model share one GPU.
export class JobWorker {
  private draining: Promise<void> | null = null;

  constructor(private readonly dependencies: JobWorkerDependencies) {
    for (const id of failInterruptedJobs(dependencies.db)) {
      dependencies.log(`Marked interrupted job ${id} as failed.`);
    }
  }

  wake(): Promise<void> {
    this.draining ??= this.drain().finally(() => {
      this.draining = null;
    });
    return this.draining;
  }

  private async drain(): Promise<void> {
    for (
      let job = claimNextJob(this.dependencies.db);
      job;
      job = claimNextJob(this.dependencies.db)
    ) {
      await this.process(job);
    }
  }

  private async process(job: Job): Promise<void> {
    const { db, log } = this.dependencies;

    try {
      const user = findUserById(db, job.userId);
      if (!user)
        throw new Error("The user who submitted this job no longer exists.");

      const documents = await this.dependencies.loadUploads(
        job.id,
        job.uploads,
      );
      const { snapshot, documents: records } = await runJob(
        job,
        user,
        documents,
        (done, total) => updateJobProgress(db, job.id, done, total),
        this.dependencies.runner,
      );

      transaction(db, () => {
        recordDocuments(db, records);
      });
      saveSnapshot(db, snapshot);
      completeJob(db, job.id, snapshot.runId);
      log(`Job ${job.id} finished as run ${snapshot.runId}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failJob(db, job.id, message);
      log(`Job ${job.id} failed: ${message}`);
    } finally {
      await this.dependencies.removeUploads(job.id);
    }
  }
}

const globalForWorker = globalThis as typeof globalThis & {
  m4iJobWorker?: JobWorker;
};

export function jobWorker(): JobWorker {
  globalForWorker.m4iJobWorker ??= new JobWorker({
    db: getDatabase(),
    runner: DEFAULT_JOB_RUNNER_DEPENDENCIES,
    loadUploads,
    removeUploads,
    log: (message) => console.log(`[jobs] ${message}`),
  });

  return globalForWorker.m4iJobWorker;
}
