"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { JobListResponse, JobView } from "@/types/feedback-types";
import { JobStatus } from "./job-status";
import { isActiveJob, MODE_LABELS, POLL_INTERVAL_MS } from "./review-helper";

function activeIds(jobs: readonly JobView[]): string {
  return jobs
    .filter(isActiveJob)
    .map((job) => job.id)
    .join(",");
}

function JobList({ title, jobs }: { title: string; jobs: JobView[] }) {
  if (jobs.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900">{title}</h2>
      <ul className="space-y-3">
        {jobs.map((job) => (
          <li key={job.id}>
            <Link
              href={`/jobs/${job.id}`}
              className={`block rounded-2xl border bg-white p-5 shadow-sm hover:border-blue-300 ${
                job.status === "failed" ? "border-rose-200" : "border-zinc-200"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-950">
                  {MODE_LABELS[job.mode].title}
                </p>
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {job.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {job.documents.join(", ")}
              </p>
              <div className="mt-3">
                <JobStatus job={job} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OpenJobs({ initialJobs }: { initialJobs: JobView[] }) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const latest = useRef(initialJobs);
  const polling = jobs.some(isActiveJob);

  useEffect(() => {
    if (!polling) return;

    const timer = setInterval(async () => {
      const response = await fetch("/api/jobs", { cache: "no-store" }).catch(
        () => null,
      );
      const result = (await response?.json()) as JobListResponse | undefined;
      if (!result?.ok) return;

      // A job that left the queue finished or failed: reload the page so a
      // finished run shows up under My runs.
      if (activeIds(latest.current) !== activeIds(result.jobs)) {
        router.refresh();
      }
      latest.current = result.jobs;
      setJobs(result.jobs);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [polling, router]);

  return (
    <>
      <JobList title="In progress" jobs={jobs.filter(isActiveJob)} />
      <JobList
        title="Recently failed"
        jobs={jobs.filter((job) => job.status === "failed")}
      />
    </>
  );
}
