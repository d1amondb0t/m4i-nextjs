import { currentUser, unauthorized } from "@/app/server/auth/session";
import { getDatabase } from "@/app/server/db/database";
import { findJob, queuePosition } from "@/app/server/db/jobs-repository";
import { jobWorker } from "@/app/server/jobs/job-worker";
import type { JobStatusResponse } from "@/types/feedback-types";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const db = getDatabase();
  const job = findJob(db, (await params).id);

  if (!job || job.userId !== user.id) {
    return Response.json(
      { ok: false, message: "No such run." } satisfies JobStatusResponse,
      { status: 404 },
    );
  }

  if (job.status === "queued") void jobWorker().wake();

  return Response.json({
    ok: true,
    job: {
      id: job.id,
      mode: job.mode,
      status: job.status,
      progressDone: job.progressDone,
      progressTotal: job.progressTotal,
      error: job.error,
      runId: job.runId,
      queuePosition: queuePosition(db, job),
    },
  } satisfies JobStatusResponse);
}
