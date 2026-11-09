import type { DatabaseSync } from "node:sqlite";

import type { Job, JobUpload, RunMode } from "@/types/feedback-types";
import { now } from "./database.ts";

type JobRow = {
  id: string;
  user_id: number;
  mode: Job["mode"];
  status: Job["status"];
  question: string | null;
  uploads_json: string;
  progress_done: number;
  progress_total: number;
  error: string | null;
  run_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    userId: row.user_id,
    mode: row.mode,
    status: row.status,
    question: row.question,
    uploads: JSON.parse(row.uploads_json) as JobUpload[],
    progressDone: row.progress_done,
    progressTotal: row.progress_total,
    error: row.error,
    runId: row.run_id,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export function createJob(
  db: DatabaseSync,
  job: {
    id: string;
    userId: number;
    mode: RunMode;
    question: string | null;
    uploads: JobUpload[];
  },
): void {
  db.prepare(
    `INSERT INTO jobs (id, user_id, mode, status, question, uploads_json, created_at)
     VALUES (?, ?, ?, 'queued', ?, ?, ?)`,
  ).run(
    job.id,
    job.userId,
    job.mode,
    job.question,
    JSON.stringify(job.uploads),
    now(),
  );
}

export function findJob(db: DatabaseSync, id: string): Job | null {
  const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as
    JobRow | undefined;

  return row ? toJob(row) : null;
}

export function claimNextJob(db: DatabaseSync): Job | null {
  const row = db
    .prepare(
      `UPDATE jobs SET status = 'running', started_at = ?
       WHERE id = (
         SELECT id FROM jobs WHERE status = 'queued'
         ORDER BY created_at, rowid LIMIT 1
       )
       RETURNING *`,
    )
    .get(now()) as JobRow | undefined;

  return row ? toJob(row) : null;
}

export function queuePosition(db: DatabaseSync, job: Job): number {
  if (job.status !== "queued") return 0;

  const { ahead } = db
    .prepare(
      `SELECT COUNT(*) AS ahead FROM jobs
       WHERE status = 'running'
          OR (status = 'queued' AND (created_at < ? OR (created_at = ? AND rowid < (SELECT rowid FROM jobs WHERE id = ?))))`,
    )
    .get(job.createdAt, job.createdAt, job.id) as { ahead: number };

  return ahead;
}

export function updateJobProgress(
  db: DatabaseSync,
  id: string,
  done: number,
  total: number,
): void {
  db.prepare(
    "UPDATE jobs SET progress_done = ?, progress_total = ? WHERE id = ?",
  ).run(done, total, id);
}

export function completeJob(db: DatabaseSync, id: string, runId: string): void {
  db.prepare(
    `UPDATE jobs SET status = 'done', run_id = ?, finished_at = ?, progress_done = progress_total
     WHERE id = ?`,
  ).run(runId, now(), id);
}

export function failJob(db: DatabaseSync, id: string, error: string): void {
  db.prepare(
    "UPDATE jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?",
  ).run(error, now(), id);
}

export function failInterruptedJobs(db: DatabaseSync): string[] {
  const rows = db
    .prepare(
      `UPDATE jobs SET status = 'failed', error = 'The server restarted during this run. Submit it again.', finished_at = ?
       WHERE status = 'running'
       RETURNING id`,
    )
    .all(now()) as { id: string }[];

  return rows.map((row) => row.id);
}

export function listQueuedJobIds(db: DatabaseSync): string[] {
  return (
    db
      .prepare(
        "SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at, rowid",
      )
      .all() as { id: string }[]
  ).map((row) => row.id);
}
