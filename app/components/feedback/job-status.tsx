import type { JobView } from "@/types/feedback-types";
import { jobPercent, jobProgressLabel, jobStep } from "./review-helper";

export function JobStatus({ job }: { job: JobView }) {
  const failed = job.status === "failed";
  const percent = jobPercent(job);
  const step = jobStep(job);

  return (
    <div>
      {!failed && (
        <div
          className="h-2 overflow-hidden rounded-full bg-zinc-100"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{
              width: `${Math.max(percent, job.status === "running" ? 3 : 0)}%`,
            }}
          />
        </div>
      )}
      <p
        className={`mt-2 text-sm ${failed ? "text-rose-700" : "text-zinc-600"}`}
      >
        {step && !failed && (
          <span className="font-medium text-zinc-800">{step} · </span>
        )}
        {jobProgressLabel(job)}
      </p>
    </div>
  );
}
