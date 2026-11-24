import type { RagSource, RankChange } from "@/types/rag-pipeline-type";

export function changeAfterReranking(
  { retrievalRank, rerankedRank }: RagSource,
  topK: number,
): RankChange {
  if (retrievalRank > topK) {
    return { label: `New · was #${retrievalRank}`, tone: "gained" };
  }

  if (retrievalRank === rerankedRank) {
    return { label: "Same rank", tone: "neutral" };
  }

  return {
    label: `${retrievalRank > rerankedRank ? "▲" : "▼"} was #${retrievalRank}`,
    tone: "neutral",
  };
}

export function changeWithoutReranking(
  { retrievalRank, rerankedRank }: RagSource,
  topK: number,
): RankChange {
  if (rerankedRank > topK) {
    return { label: `Dropped · now #${rerankedRank}`, tone: "lost" };
  }

  if (retrievalRank === rerankedRank) {
    return { label: "Same rank", tone: "neutral" };
  }

  return {
    label: `${rerankedRank < retrievalRank ? "▲" : "▼"} now #${rerankedRank}`,
    tone: "neutral",
  };
}

export function rerankingSummary(sources: readonly RagSource[]): string {
  const topK = sources.length;
  const newChunks = sources.filter(
    ({ retrievalRank }) => retrievalRank > topK,
  ).length;

  if (newChunks > 0) {
    return `${newChunks} of the top ${topK} chunks ${newChunks === 1 ? "is" : "are"} new.`;
  }

  return sources.some(
    ({ retrievalRank, rerankedRank }) => retrievalRank !== rerankedRank,
  )
    ? `Same top ${topK} chunks, in a different order.`
    : `Same top ${topK} chunks, in the same order.`;
}
