import { currentUser, unauthorized } from "@/app/server/auth/session";
import { getDatabase } from "@/app/server/db/database";
import {
  deleteFeedback,
  upsertFeedback,
} from "@/app/server/db/feedback-repository";
import { findFeedbackTarget } from "@/app/server/db/runs-repository";
import {
  allowedVerdicts,
  parseFeedbackRequest,
  parseFeedbackTarget,
} from "@/app/server/feedback/feedback-helper";
import type { FeedbackResponse } from "@/types/feedback-types";

export const runtime = "nodejs";

function failure(message: string, status: number) {
  return Response.json({ ok: false, message } satisfies FeedbackResponse, {
    status,
  });
}

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const feedback = parseFeedbackRequest(await request.json().catch(() => null));
  if (typeof feedback === "string") return failure(feedback, 400);

  const db = getDatabase();
  const target = findFeedbackTarget(
    db,
    feedback.targetType,
    feedback.targetId,
    user.id,
  );
  if (!target) return failure("That item is not in one of your runs.", 404);

  if (!allowedVerdicts(target).includes(feedback.verdict)) {
    return failure(
      `Use ${allowedVerdicts(target).join(" or ")} for this item.`,
      400,
    );
  }

  const saved = upsertFeedback(db, {
    userId: user.id,
    runId: target.runId,
    targetType: feedback.targetType,
    targetId: feedback.targetId,
    verdict: feedback.verdict,
    comment: feedback.comment ?? "",
  });

  return Response.json({
    ok: true,
    feedback: saved,
  } satisfies FeedbackResponse);
}

export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const target = parseFeedbackTarget(await request.json().catch(() => null));
  if (typeof target === "string") return failure(target, 400);

  deleteFeedback(getDatabase(), user.id, target.targetType, target.targetId);
  return Response.json({ ok: true, feedback: null } satisfies FeedbackResponse);
}
