import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { ROOT, read, save, hash, key, loadPool, loadScored, totalsFor, mean, metrics, summary, evaluate, tuneRanking, pairedInterval, fuse, folds, adaptive, conformalLower, crcThreshold } from './common.mjs';

const started = performance.now();
const result = { generatedAt: new Date().toISOString(), protocol: 'PLAN.md', families: [], audit: {} };
const addFamily = (id, baselineRows, cv, extra = {}) => {
  result.families.push({
    id, baseline: summary(baselineRows), crossValidated: cv.summary,
    changes: Object.fromEntries(['ndcg10', 'p5', 'precision', 'relevant', 'count', 'uniqueRelevantPages', 'words', 'coverage'].map(k => [k, pairedInterval(cv.rows, baselineRows, k)])),
    selections: cv.selections, rows: cv.rows, ...extra
  });
};

// Verify first-stage arithmetic within each chunking, never aggregate recall
// denominators across incomparable chunk boundaries.
const totalsByA = new Map();
const getTotals = a => {
  if (!totalsByA.has(a)) totalsByA.set(a, totalsFor(a));
  return totalsByA.get(a);
};
result.audit.stage1 = [];
for (const saved of read('stage1-metrics').rows) {
  const pool = loadPool(saved.id), totals = getTotals(saved.id.split('.')[0]);
  const computed = summary(evaluate(pool, q => q.retrieved, totals));
  result.audit.stage1.push({
    id: saved.id, savedNdcg: saved.ndcgAt10, recomputedNdcg: computed.ndcg10,
    savedP5: saved.precisionAt5, recomputedP5: computed.p5
  });
}
console.log('[review] Recomputed all 48 first-stage configurations');

for (const a of ['a2', 'a3', 'a4']) {
  const dense = loadPool(`${a}.b4.c1`), sparse = loadPool(`${a}.b4.c2`), hybrid = loadPool(`${a}.b4.c3`);
  const maps = new Map(dense.map((q, i) => [q.questionId, [q.retrieved, sparse[i].retrieved]]));
  const totals = getTotals(a);
  const variants = [60, 30, 10].flatMap(k => [.5, .75, .25, 1, 0].map(weight => ({ k, weight })));
  const cv = tuneRanking(dense, variants, (q, v) => fuse(maps.get(q.questionId), [v.weight, 1 - v.weight], v.k), totals);
  const baseline = evaluate(dense, q => fuse(maps.get(q.questionId), [1, 1], 60), totals);
  const changedCachedRankings = dense.filter((q, i) =>
    fuse(maps.get(q.questionId), [1, 1], 60).map(c => c.chunkId).join() !== hybrid[i].retrieved.map(c => c.chunkId).join()).length;
  addFamily(`fusion-${a}`, baseline, cv, {
    variants, changedCachedRankings,
    baselineNote: 'Reconstructed from the exact same cached dense/sparse legs as every variant.'
  });
}

for (const a of ['a3', 'a4']) {
  const pool = loadScored(`${a}.b4.c3-d7`), original = loadPool(`${a}.b4.c3`), totals = getTotals(a);
  const ranks = new Map(original.map(q => [q.questionId, new Map(q.retrieved.map((c, i) => [c.chunkId, 1 - i / q.retrieved.length]))]));
  const variants = [0, .1, .25, .5, .75, 1];
  const cv = tuneRanking(pool, variants, (q, weight) => q.retrieved.map(c => ({
    ...c,
    blendScore: (1 - weight) * c.score + weight * ranks.get(q.questionId).get(c.chunkId),
  })).sort((a, b) => b.blendScore - a.blendScore), totals);
  addFamily(`blend-${a}`, evaluate(pool, q => q.retrieved, totals), cv, { variants });
}

const pool = loadScored('a4.b4.c3-d7'), totals = getTotals('a4');
const tokenCache = new Map();
const tokens = c => {
  if (!tokenCache.has(c.chunkId)) tokenCache.set(c.chunkId, new Set(c.body.toLowerCase().match(/[a-z]{3,}/g) ?? []));
  return tokenCache.get(c.chunkId);
};
const similarities = new Map();
const similarity = (a, b) => {
  const k = [a.chunkId, b.chunkId].sort().join(':');
  if (!similarities.has(k)) {
    const left = tokens(a), right = tokens(b);
    const intersection = [...left].filter(t => right.has(t)).length;
    similarities.set(k, intersection / (left.size + right.size - intersection || 1));
  }
  return similarities.get(k);
};
function filter(q, strategy) {
  if (strategy === 'none') return q.retrieved;
  if (strategy === 'front-matter') return [...q.retrieved].sort((a, b) =>
    Number(/^(table of contents|contents\b|references\b|acknowledg|disclaimer\b)/i.test(a.body)) -
    Number(/^(table of contents|contents\b|references\b|acknowledg|disclaimer\b)/i.test(b.body)));
  if (strategy.startsWith('mmr')) {
    const lambda = Number(strategy.split(':')[1]);
    const pending = [...q.retrieved], selected = [];
    while (pending.length) {
      const utility = c => lambda * c.score - (1 - lambda) * Math.max(0, ...selected.map(s => similarity(c, s)));
      let best = 0;
      for (let i = 1; i < pending.length; i++) if (utility(pending[i]) > utility(pending[best])) best = i;
      selected.push(pending.splice(best, 1)[0]);
    }
    return selected;
  }
  const counts = new Map();
  return q.retrieved.filter(c => {
    const k = strategy === 'page' ? `${c.documentId}/${c.page}` : c.documentId;
    const count = counts.get(k) ?? 0;
    if (count >= (strategy === 'page' ? 1 : Number(strategy.split(':')[1]))) return false;
    counts.set(k, count + 1);
    return true;
  });
}
const filterVariants = ['none', 'page', 'source:1', 'source:2', 'source:3', 'front-matter', 'mmr:0.7', 'mmr:0.85', 'mmr:0.95'];
// Precompute to make the tuning loop cheap and completely label-blind.
const filtered = new Map(pool.map(q => [q.questionId, new Map(filterVariants.map(v => [v, filter(q, v).slice(0, 5)]))]));
const filterCv = tuneRanking(pool, filterVariants, (q, v) => filtered.get(q.questionId).get(v), totals, 'p5');
const fixedRows = evaluate(pool, q => q.retrieved.slice(0, 5), totals);
addFamily('filter-a4', fixedRows, filterCv, {
  variants: filterVariants,
  descriptiveVariants: filterVariants.map(id => ({ id, summary: summary(evaluate(pool, q => filtered.get(q.questionId).get(id), totals)) }))
});

const adaptiveVariants = [.5, .6, .7, .8, .9].flatMap(accept => [1, 3].flatMap(min =>
  [5, 8, 12].flatMap(max => [.01, .75, .9].map(dropoff => ({ accept, min, max, dropoff })))));
const adaptiveRows = [], adaptiveSelections = [], crcReports = [.05, .1, .2].map(alpha => ({ alpha, rows: [], selections: [] }));
for (const f of folds(pool)) {
  const reject = Math.max(0, conformalLower(f.train.map(q => q.retrieved[0]?.score ?? 0), .05));
  const baseline = summary(evaluate(f.train, q => q.retrieved.slice(0, 5), totals));
  const candidates = adaptiveVariants.map(v => {
    const configuration = { ...v, reject: Math.min(reject, v.accept) };
    return { configuration, score: summary(evaluate(f.train, q => adaptive(q.retrieved, configuration), totals)) };
  }).filter(v => v.score.relevant >= baseline.relevant && v.score.count <= 5 && v.score.precision > baseline.precision);
  candidates.sort((a, b) => b.score.precision - a.score.precision);
  const winner = candidates[0]?.configuration ?? null;
  adaptiveSelections.push({ fold: f.fold, configuration: winner ?? 'fixed5', categories: [...new Set(f.test.map(q => q.questionId.split('#')[0]))] });
  adaptiveRows.push(...evaluate(f.test, q => winner ? adaptive(q.retrieved, winner) : q.retrieved.slice(0, 5), totals));
  for (const report of crcReports) {
    const fitted = crcThreshold(f.train, report.alpha);
    report.selections.push({ fold: f.fold, ...fitted });
    report.rows.push(...f.test.map(q => {
      const selected = q.retrieved.filter(c => c.score >= fitted.threshold);
      const positive = q.retrieved.filter(c => c.relevant).length;
      return { ...metrics(q, selected, totals.get(q.questionId)), poolRecallLoss: positive ? 1 - selected.filter(c => c.relevant).length / positive : 0 };
    }));
  }
}
addFamily('adaptive-a4', fixedRows, { summary: summary(adaptiveRows), rows: adaptiveRows, selections: adaptiveSelections }, { variantCount: adaptiveVariants.length + 1 });
result.crc = crcReports.map(r => ({ ...r, summary: summary(r.rows), observedPoolRecallLoss: mean(r.rows.map(q => q.poolRecallLoss)) }));
const defaults = { accept: .7, reject: .6, min: 1, max: 8, dropoff: .01 };
result.historicalDefaults = {
  configuration: defaults, summary: summary(evaluate(pool, q => adaptive(q.retrieved, defaults), totals)),
  caveat: 'Descriptive only; these defaults were previously selected on this benchmark.'
};

// Isolate judge sensitivity on precisely the same six sampled candidates.
const second = read('judge-cache-second');
const sampled = loadPool('a3.b4.c3').map(q => {
  // Match stage 4's positions exactly. Merely selecting every cached label can
  // add a seventh item when another position has identical passage text.
  const step = Math.max(1, Math.floor(q.retrieved.length / 6));
  const retrieved = q.retrieved.filter((_, i) => i % step === 0).slice(0, 6);
  if (retrieved.length !== 6 || retrieved.some(c => typeof second[key(q.questionId, c.body)] !== 'boolean')) {
    throw new Error('Incomplete independent-judge sample: ' + q.questionId);
  }
  return { ...q, retrieved };
});
const rerankerRows = [];
for (let d = 1; d <= 7; d++) {
  const scored = loadScored(`a3.b4.c3-d${d}`);
  const byQ = new Map(scored.map(q => [q.questionId, new Map(q.retrieved.map(c => [c.chunkId, c.score]))]));
  for (const judge of ['primary', 'secondary']) {
    const rows = sampled.map(q => {
      const selected = q.retrieved.map(c => ({ ...c, relevant: judge === 'primary' ? c.relevant : second[key(q.questionId, c.body)], score: byQ.get(q.questionId).get(c.chunkId) }))
        .sort((a, b) => b.score - a.score);
      return metrics(q, selected, selected.filter(c => c.relevant).length);
    });
    rerankerRows.push({ reranker: `d${d}`, judge, summary: summary(rows), rows });
  }
}
result.judgeSensitivity = { passages: sampled.reduce((n, q) => n + q.retrieved.length, 0), caveat: 'Reranked six-item judged subpools; not full top-20 metrics.', rows: rerankerRows };
result.audit.cacheFingerprints = Object.fromEntries(['judge-cache', 'judge-cache-second', 'stage1-metrics', 'stage5-operating-point'].map(name => [name, hash(readFileSync(ROOT + name + '.json'))]));
result.seconds = (performance.now() - started) / 1000;
save('offline', result);
console.log(JSON.stringify({ families: result.families.map(({ id, baseline, crossValidated, changes }) => ({ id, baseline, crossValidated, delta: changes.p5 })), crc: result.crc.map(({ alpha, observedPoolRecallLoss, summary }) => ({ alpha, observedPoolRecallLoss, summary })) }, null, 2));
