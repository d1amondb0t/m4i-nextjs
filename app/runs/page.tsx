import Link from "next/link";
import { redirect } from "next/navigation";

import { OpenJobs } from "../components/feedback/open-jobs";
import { MODE_LABELS } from "../components/feedback/review-helper";
import { PageHeader } from "../components/page-header";
import { currentUser } from "../server/auth/session";
import { getDatabase } from "../server/db/database";
import { listOpenJobs } from "../server/db/jobs-repository";
import { listRuns } from "../server/db/runs-repository";
import { jobView } from "../server/jobs/job-view-helper";

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function RunsPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/runs");

  const db = getDatabase();
  const runs = listRuns(db, user.id);
  const jobs = listOpenJobs(db, user.id).map((job) => jobView(db, job));

  return (
    <div>
      <PageHeader eyebrow="M4I" title="My runs">
        Open a run to keep reviewing it. Your feedback is saved as you go.
      </PageHeader>
      <OpenJobs initialJobs={jobs} />
      {runs.length > 0 && jobs.length > 0 && (
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Finished</h2>
      )}
      {runs.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
          No finished runs yet.{" "}
          <Link
            href="/"
            className="font-medium text-blue-700 hover:text-blue-900"
          >
            Start one
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-3">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                href={`/runs/${run.id}`}
                className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-blue-300"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-zinc-950">
                    {run.mode === "rag"
                      ? run.firstQuestion
                      : MODE_LABELS[run.mode].title}
                  </p>
                  <span className="text-xs text-zinc-500">
                    {DATE_FORMAT.format(new Date(run.createdAt))}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {run.documents.join(", ")}
                </p>
                <p className="mt-2 text-xs font-medium text-zinc-700">
                  {run.reviewedItems} of {run.items}{" "}
                  {MODE_LABELS[run.mode].items} reviewed
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
