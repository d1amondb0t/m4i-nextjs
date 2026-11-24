"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import {
  ACTIVE_JOB_KEY,
  readStorage,
  subscribeToStorage,
} from "./review-helper";

export function ActiveJobBanner() {
  const jobId = useSyncExternalStore(
    subscribeToStorage,
    () => readStorage(ACTIVE_JOB_KEY),
    () => null,
  );

  if (!jobId) return null;

  return (
    <Link
      href={`/jobs/${jobId}`}
      className="mb-6 block rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 hover:bg-blue-100"
    >
      You have a run in progress. See its progress →
    </Link>
  );
}
