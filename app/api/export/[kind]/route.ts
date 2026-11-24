import type { DatabaseSync } from "node:sqlite";

import {
  currentUser,
  forbidden,
  unauthorized,
} from "@/app/server/auth/session";
import { getDatabase } from "@/app/server/db/database";
import {
  exportChunkRows,
  exportFeedbackRows,
  exportQuestionRows,
} from "@/app/server/db/feedback-repository";
import { csvResponse } from "@/app/server/feedback/csv-helper";

export const runtime = "nodejs";

const EXPORTS: Record<string, (db: DatabaseSync) => Record<string, unknown>[]> =
  {
    feedback: exportFeedbackRows,
    chunks: exportChunkRows,
    questions: exportQuestionRows,
  };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const kind = (await params).kind.replace(/\.csv$/, "");
  const rows = Object.hasOwn(EXPORTS, kind) ? EXPORTS[kind] : null;

  if (!rows) {
    return Response.json(
      { ok: false, message: "Export feedback, chunks or questions." },
      { status: 404 },
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  return csvResponse(`m4i-${kind}-${date}.csv`, rows(getDatabase()));
}
