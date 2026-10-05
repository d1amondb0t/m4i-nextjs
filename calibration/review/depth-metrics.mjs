export const average = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

export function depthMetrics(q, ranked, k, totalRelevant) {
  if (!Number.isInteger(k) || k < 0) throw new Error('k must be a nonnegative integer');
  const selected = ranked.slice(0, k);
  if (new Set(selected.map(c => c.chunkId)).size !== selected.length) throw new Error('Duplicate chunk ID');
  if (selected.some(c => typeof c.relevant !== 'boolean')) throw new Error('Unjudged result');
  const relevant = selected.filter(c => c.relevant);
  if (relevant.length > totalRelevant) throw new Error('Recall denominator is incomplete');
  const discount = i => 1 / Math.log2(i + 2);
  const ideal = Array.from({ length: Math.min(10, totalRelevant) }, (_, i) => discount(i)).reduce((a, b) => a + b, 0);
  return {
    questionId: q.questionId, category: q.questionId.split('#')[0], dimensionId: q.dimensionId, k,
    precision: k ? relevant.length / k : 0,
    returnedPrecision: selected.length ? relevant.length / selected.length : 0,
    recall: totalRelevant ? relevant.length / totalRelevant : 0,
    p5: selected.slice(0, 5).filter(c => c.relevant).length / 5,
    ndcg10: ideal ? selected.slice(0, 10).reduce((s, c, i) => s + (c.relevant ? discount(i) : 0), 0) / ideal : 0,
    relevant: relevant.length, count: selected.length,
    uniqueRelevantPages: new Set(relevant.map(c => `${c.documentId}/${c.page}`)).size,
    words: selected.reduce((s, c) => s + c.body.trim().split(/\s+/).filter(Boolean).length, 0),
    totalRelevant, coverage: selected.length ? 1 : 0,
  };
}

export function aggregateDepth(rows) {
  const keys = ['precision', 'returnedPrecision', 'recall', 'p5', 'ndcg10', 'relevant', 'count', 'uniqueRelevantPages', 'words', 'totalRelevant', 'coverage'];
  return { questions: rows.length, ...Object.fromEntries(keys.map(k => [k, average(rows.map(r => r[k]))])) };
}

export function scorePrefix(candidates, scores, depth) {
  return candidates.slice(0, depth).map(c => {
    const score = scores[c.chunkId];
    if (!Number.isFinite(score)) throw new Error('Missing reranker score: ' + c.chunkId);
    return { ...c, score };
  }).sort((a, b) => b.score - a.score);
}
