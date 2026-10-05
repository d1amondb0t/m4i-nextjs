import { readFileSync, writeFileSync } from 'node:fs';
import { OUT, read, loadPool, loadScored, totalsFor, evaluate, summary } from './common.mjs';

const ontology = JSON.parse(readFileSync(new URL('../ontology.json', import.meta.url), 'utf8'));
const review = JSON.parse(readFileSync(OUT + 'offline.json', 'utf8'));
const live = JSON.parse(readFileSync(OUT + 'live-ontology.json', 'utf8'));
const dimensions = new Map(loadPool('a4.b4.c3').map(q => [q.questionId, q.dimensionId]));
const chunking = { a1: '200/50', a2: '400/80', a3: '800/150', a4: '400/80 + header' };
const embeddings = { b1: 'BGE-base', b2: 'BGE-M3', b3: 'Nomic', b4: 'Qwen3-embedding 0.6B' };
const retrieval = { c1: 'dense', c2: 'BM25', c3: 'hybrid RRF60, 1:1' };
const rerankers = { d1: 'none', d2: 'MiniLM-L6', d3: 'BGE-base reranker', d4: 'Jina turbo', d5: 'Mixedbread xsmall', d6: 'Qwen3.5 9B listwise', d7: 'Qwen3.5 9B pointwise' };
const totals = new Map(['a1', 'a2', 'a3', 'a4'].map(a => [a, totalsFor(a)]));
const systems = [];
function add(id, poolId, reranker, rows, extra = {}) {
  const [a, b, c] = poolId.split('.');
  systems.push({
    id, chunking: chunking[a], embedding: embeddings[b], retrieval: retrieval[c], reranker,
    metricDenominator: a, ...extra, overall: summary(rows),
    byDimension: ontology.dimensions.map(d => ({ id: d.id, name: d.name, ...summary(rows.filter(r => dimensions.get(r.questionId) === d.id)) })), rows
  });
}
for (const config of read('stage1-metrics').rows) {
  const q = loadPool(config.id);
  add(config.id, config.id, 'none', evaluate(q, q => q.retrieved, totals.get(config.chunking)), { evaluation: 'historical fixed setting' });
}
for (const config of read('stage2-metrics').rows) {
  if (config.reranker === 'd1') continue; // already represented in stage 1
  const id = config.pool + '-' + config.reranker;
  const q = loadScored(id);
  add(id, config.pool, rerankers[config.reranker], evaluate(q, q => q.retrieved, totals.get(config.pool.split('.')[0])), { evaluation: 'historical fixed setting' });
}
for (const f of review.families.filter(f => f.id.startsWith('fusion') || f.id.startsWith('blend'))) {
  const a = f.id.split('-')[1];
  const blend = f.id.startsWith('blend');
  add(f.id, `${a}.b4.c3`, blend ? 'Qwen3.5 9B pointwise + original-rank blend' : 'none', f.rows, {
    evaluation: 'category-separated cross-validation',
    retrieval: blend ? retrieval.c3 : 'tuned weighted RRF',
    foldConfigurations: f.selections,
  });
}
for (const v of live.variants) {
  add('live-' + v.id, 'a4.b4.c3', 'none', v.rows, {
    retrieval: v.id, metricDenominator: 'a4 enlarged live judgment union', evaluation: 'live fixed ontology-query arm',
  });
}
function compare(a, b) {
  const delta = b.p5 - a.p5;
  return Math.abs(delta) > 1e-10 ? delta : a.words - b.words;
}
systems.sort((a, b) => compare(a.overall, b.overall));
const winners = ontology.dimensions.map(d => {
  const ranked = systems.map(s => ({ system: s, metrics: s.byDimension.find(x => x.id === d.id) })).sort((a, b) => compare(a.metrics, b.metrics));
  const best = ranked[0];
  return { dimension: d.name, ...best, tiedSystems: ranked.filter(r => Math.abs(r.metrics.p5 - best.metrics.p5) < 1e-10).map(r => r.system.id) };
}).sort((a, b) => compare(a.metrics, b.metrics));
const p = value => (100 * value).toFixed(1) + '%';
const row = (s, m) => `| ${s.id} | ${s.chunking} | ${s.embedding} | ${s.retrieval} | ${s.reranker} | ${p(m.p5)} | ${p(m.ndcg10)} | ${p(m.recall20)} | ${Math.round(m.words)} |`;
let markdown = `# Results across ontology dimensions\n\nComputed from saved runs; no new model inference.\n\n`;
markdown += `Sorted by P@5, with lower retrieved words as the tie-breaker. These are observed rankings, not independently validated per-dimension model choices. All lists have 20 candidates; words means the full 20-candidate pool. Chunk sizes differ, so this is not an equal-token-budget comparison. nDCG and recall share a denominator within each chunking only; recall is pooled, not exhaustive corpus recall. Stage 2 nDCG is recalculated against the stage 1 pooled union. CV means category-separated parameter selection on the same previously explored benchmark.\n\n`;
markdown += '| Configuration | Words/overlap | Embedder | Retrieval | Reranker | P@5 | nDCG@10 | Pooled R@20 | Pool words |\n|---|---|---|---|---|---|---|---|---|\n';
markdown += systems.map(s => row(s, s.overall)).join('\n');
markdown += '\n\n## Tuned configuration details\n\nFusion uses dense weight w and BM25 weight 1-w. Blend uses (1-w) times the pointwise LLM score plus w times the normalized original retrieval rank, 1 - zero-based-rank/20. Each setting is chosen on the training categories of that fold.\n\n';
for (const s of systems.filter(s => s.foldConfigurations)) {
  const unique = [...new Set(s.foldConfigurations.map(f => JSON.stringify(f.configuration)))];
  markdown += `- ${s.id}: ${unique.join('; ')}.\n`;
}
for (const d of ontology.dimensions) {
  const ranked = [...systems].sort((a, b) => compare(a.byDimension.find(x => x.id === d.id), b.byDimension.find(x => x.id === d.id)));
  markdown += `\n\n## ${d.name} — 12 questions\n\n| Configuration | Words/overlap | Embedder | Retrieval | Reranker | P@5 | nDCG@10 | Pooled R@20 | Pool words |\n|---|---|---|---|---|---|---|---|---|\n`;
  markdown += ranked.map(s => row(s, s.byDimension.find(x => x.id === d.id))).join('\n');
}
const result = { generatedAt: new Date().toISOString(), sort: 'P@5 descending, full pool words ascending for ties', systems, winners };
writeFileSync(OUT + 'dimension-summary.json', JSON.stringify(result, null, 2));
writeFileSync(OUT + 'dimension-summary.md', markdown);
console.log(JSON.stringify({
  totalSystems: systems.length,
  overall: systems.slice(0, 8).map(({ id, chunking, embedding, retrieval, reranker, overall }) => ({ id, chunking, embedding, retrieval, reranker, ...overall })),
  winners: winners.map(({ dimension, system, metrics, tiedSystems }) => ({ dimension, id: system.id, chunking: system.chunking, embedding: system.embedding, retrieval: system.retrieval, reranker: system.reranker, ...metrics, tiedSystems }))
}, null, 2));
