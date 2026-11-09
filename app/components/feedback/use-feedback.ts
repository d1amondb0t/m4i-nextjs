"use client";

import { useCallback, useRef, useState } from "react";

import type {
  FeedbackEntry,
  FeedbackResponse,
  FeedbackTargetType,
  Verdict,
} from "@/types/feedback-types";
import { feedbackKey } from "@/app/server/feedback/feedback-helper";

export type SaveState = "saving" | "saved" | "error";

export type FeedbackController = {
  feedback: Record<string, FeedbackEntry>;
  saveStates: Record<string, SaveState>;
  errors: Record<string, string>;
  save(
    targetType: FeedbackTargetType,
    targetId: number,
    verdict: Verdict,
    comment: string,
  ): Promise<boolean>;
  clear(targetType: FeedbackTargetType, targetId: number): Promise<boolean>;
};

async function send(
  method: "PUT" | "DELETE",
  body: Record<string, unknown>,
): Promise<FeedbackResponse> {
  const response = await fetch("/api/feedback", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return (await response.json().catch(() => ({
    ok: false,
    message: `The server answered ${response.status}.`,
  }))) as FeedbackResponse;
}

function withEntry(
  feedback: Record<string, FeedbackEntry>,
  key: string,
  entry: FeedbackEntry | null | undefined,
): Record<string, FeedbackEntry> {
  const next = { ...feedback };
  if (entry) next[key] = entry;
  else delete next[key];
  return next;
}

export function useFeedback(
  initial: Record<string, FeedbackEntry>,
): FeedbackController {
  const [feedback, setFeedback] = useState(initial);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The last value the server confirmed, and the newest request per target,
  // so a slow response never overwrites a later click.
  const confirmed = useRef(initial);
  const latestRequest = useRef<Record<string, number>>({});

  const apply = useCallback(
    async (
      key: string,
      optimistic: FeedbackEntry | null,
      request: () => Promise<FeedbackResponse>,
    ) => {
      const requestId = (latestRequest.current[key] ?? 0) + 1;
      latestRequest.current[key] = requestId;
      setFeedback((current) => withEntry(current, key, optimistic));
      setSaveStates((current) => ({ ...current, [key]: "saving" }));

      const result = await request().catch(
        (error: unknown): FeedbackResponse => ({
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Could not reach the server.",
        }),
      );

      if (result.ok) {
        confirmed.current = withEntry(confirmed.current, key, result.feedback);
      }
      if (latestRequest.current[key] !== requestId) return result.ok;

      setFeedback((current) => withEntry(current, key, confirmed.current[key]));
      setSaveStates((current) => ({
        ...current,
        [key]: result.ok ? "saved" : "error",
      }));
      setErrors((current) => {
        const next = { ...current };
        if (result.ok) delete next[key];
        else next[key] = result.message;
        return next;
      });
      return result.ok;
    },
    [],
  );

  const save = useCallback<FeedbackController["save"]>(
    (targetType, targetId, verdict, comment) =>
      apply(
        feedbackKey(targetType, targetId),
        { verdict, comment, updatedAt: new Date().toISOString() },
        () => send("PUT", { targetType, targetId, verdict, comment }),
      ),
    [apply],
  );

  const clear = useCallback<FeedbackController["clear"]>(
    (targetType, targetId) =>
      apply(feedbackKey(targetType, targetId), null, () =>
        send("DELETE", { targetType, targetId }),
      ),
    [apply],
  );

  return { feedback, saveStates, errors, save, clear };
}
