import type {
  AdaptiveRetrievalConfiguration,
  AdaptiveSelection,
  RetrievalDecision,
} from "@/types/retrieval-types";
import type { SearchResult } from "../storage/storage-types";

export function validateAdaptiveConfiguration(
  configuration: AdaptiveRetrievalConfiguration,
): void {
  const { acceptThreshold, rejectThreshold, minimumK, maximumK, relativeDropoff } =
    configuration;

  for (const [name, value] of Object.entries(configuration)) {
    if (!Number.isFinite(value)) {
      throw new Error(`${name} must be a finite number.`);
    }
  }

  for (const [name, value] of [
    ["acceptThreshold", acceptThreshold],
    ["rejectThreshold", rejectThreshold],
    ["relativeDropoff", relativeDropoff],
  ] as const) {
    if (value < 0 || value > 1) {
      throw new Error(`${name} must be between 0 and 1.`);
    }
  }

  if (rejectThreshold > acceptThreshold) {
    throw new Error("rejectThreshold must not exceed acceptThreshold.");
  }

  if (!Number.isSafeInteger(minimumK) || minimumK <= 0) {
    throw new Error("minimumK must be a positive integer.");
  }

  if (!Number.isSafeInteger(maximumK) || maximumK < minimumK) {
    throw new Error("maximumK must be an integer greater than or equal to minimumK.");
  }
}

/**
 * Chooses how many retrieved chunks to trust, and whether to trust them at all.
 *
 * `k` is not fixed: it is the number of candidates that clear the band the
 * question landed in, trimmed by a relative drop-off so a single strong match
 * does not drag in the mediocre tail behind it, then clamped to
 * [minimumK, maximumK].
 *
 * Results are sorted defensively; callers normally pass the reranked list.
 */
export function adaptiveSelect(
  results: readonly SearchResult[],
  configuration: AdaptiveRetrievalConfiguration,
): AdaptiveSelection {
  validateAdaptiveConfiguration(configuration);

  const ranked = [...results].sort((left, right) => right.score - left.score);

  if (ranked.length === 0) {
    return {
      decision: "reject",
      k: 0,
      topScore: 0,
      aboveAccept: 0,
      aboveReject: 0,
      selected: [],
    };
  }

  const topScore = ranked[0].score;
  const aboveAccept = ranked.filter(
    (result) => result.score >= configuration.acceptThreshold,
  ).length;
  const aboveReject = ranked.filter(
    (result) => result.score >= configuration.rejectThreshold,
  ).length;

  if (aboveReject === 0) {
    return { decision: "reject", k: 0, topScore, aboveAccept, aboveReject, selected: [] };
  }

  const decision: RetrievalDecision = aboveAccept > 0 ? "accept" : "ambiguous";
  const pool = aboveAccept > 0 ? aboveAccept : aboveReject;
  const floor = topScore * configuration.relativeDropoff;

  let width = 0;

  while (width < pool && ranked[width].score >= floor) {
    width += 1;
  }

  const k = Math.min(
    Math.max(width, configuration.minimumK),
    configuration.maximumK,
    ranked.length,
  );

  return {
    decision,
    k,
    topScore,
    aboveAccept,
    aboveReject,
    selected: ranked.slice(0, k),
  };
}
