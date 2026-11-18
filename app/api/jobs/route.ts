import { randomUUID } from "node:crypto";

import { validateRagDocumentSelection } from "@/app/server/documents/upload-policy";
import { currentUser, unauthorized } from "@/app/server/auth/session";
import { getDatabase } from "@/app/server/db/database";
import { createJob } from "@/app/server/db/jobs-repository";
import { jobWorker } from "@/app/server/jobs/job-worker";
import { removeUploads, saveUploads } from "@/app/server/jobs/upload-store";
import {
  RUN_MODES,
  type CreateJobResponse,
  type RunMode,
} from "@/types/feedback-types";
import { validateQuestion } from "@/types/rag-pipeline-type";

export const runtime = "nodejs";

function badRequest(message: string) {
  return Response.json({ ok: false, message } satisfies CreateJobResponse, {
    status: 400,
  });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const formData = await request.formData();
  const mode = formData.get("mode") as RunMode;

  if (!RUN_MODES.includes(mode)) {
    return badRequest(`mode must be one of ${RUN_MODES.join(", ")}.`);
  }

  const documents = formData
    .getAll("documents")
    .filter((entry): entry is File => entry instanceof File);
  const questionEntry = formData.get("question");
  const question =
    mode === "rag" && typeof questionEntry === "string"
      ? questionEntry.trim()
      : null;
  const error =
    validateRagDocumentSelection(documents) ??
    (mode === "rag" ? validateQuestion(question ?? "") : null);

  if (error) return badRequest(error);

  const id = randomUUID();
  try {
    const uploads = await saveUploads(id, documents);
    createJob(getDatabase(), {
      id,
      userId: user.id,
      mode,
      question,
      uploads,
    });
  } catch (cause) {
    // Without a job row, nothing else would ever remove these files.
    await removeUploads(id);
    throw cause;
  }
  void jobWorker().wake();

  return Response.json({ ok: true, jobId: id } satisfies CreateJobResponse, {
    status: 202,
  });
}
