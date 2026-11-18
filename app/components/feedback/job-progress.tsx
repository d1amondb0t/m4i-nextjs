"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { JobStatusResponse, JobView } from "@/types/feedback-types";
import { JobStatus } from "./job-status";
import {
  ACTIVE_JOB_KEY,
  MODE_LABELS,
  POLL_INTERVAL_MS,
  readStorage,
  writeStorage,
} from "./review-helper";

export function JobProgress({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const response = await fetch(`/api/jobs/${jobId}`, {
          cache: "no-store",
        });
        const result = (await response.json()) as JobStatusResponse;

        if (stopped) return;
        if (!result.ok) {
          setError(result.message);
          if (readStorage(ACTIVE_JOB_KEY) === jobId)
            writeStorage(ACTIVE_JOB_KEY, null);
          return;
        }

        setJob(result.job);
        setError("");
        if (result.job.status === "done" || result.job.status === "failed") {
          if (readStorage(ACTIVE_JOB_KEY) === jobId)
            writeStorage(ACTIVE_JOB_KEY, null);
          if (result.job.runId) router.replace(`/runs/${result.job.runId}`);
          return;
        }
      } catch {
        if (!stopped) setError("Lost contact with the server. Retrying…");
      }

      if (!stopped) timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId, router]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">
        {!job
          ? "Checking the run…"
          : job.status === "failed"
            ? "The run failed"
            : MODE_LABELS[job.mode].running}
      </h2>
      {job && (
        <div className="mt-4">
          <JobStatus job={job} />
        </div>
      )}
      {job?.status !== "failed" && (
        <p className="mt-1 text-xs text-zinc-500">
          You can close this page. The run continues and appears under My runs
          when it is done.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
      <div className="mt-5 flex gap-4 text-sm font-medium">
        <Link href="/" className="text-blue-700 hover:text-blue-900">
          Start another run
        </Link>
        <Link href="/runs" className="text-blue-700 hover:text-blue-900">
          My runs
        </Link>
      </div>
    </div>
  );
}
