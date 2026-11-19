import { currentUser, unauthorized } from "@/app/server/auth/session";
import { getDatabase } from "@/app/server/db/database";
import { findJob } from "@/app/server/db/jobs-repository";
import { jobView } from "@/app/server/jobs/job-view-helper";
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
    job: jobView(db, job),
  } satisfies JobStatusResponse);
}
