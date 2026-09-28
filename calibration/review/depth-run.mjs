import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { OUT, read, hash, key, labels, chunks, fuse, pairedInterval, folds, crcThreshold } from './common.mjs';
import { depthMetrics, aggregateDepth, scorePrefix } from './depth-metrics.mjs';

const ollama = process.env.OLLAMA_HOST || 'http://localhost:11434';
const qdrant = 'http://localhost:6333';
const model = 'qwen3.5:9b-q4_K_M';
const maxDepth = 80, depths = [5, 10, 20, 40, 80];
const questions = read('pool-a4.b4.c3').filter(q => ['1', '2'].includes(q.questionId.split('#')[1])).map(q => {
  const question = { ...q };
  delete question.retrieved;
  return question;
});
if (questions.length !== 42 || new Set(questions.map(q => q.categoryId)).size !== 21) throw new Error('Unexpected question subset');
const configs = [
  { id: 'bge-400-dense', a: 'a2', b: 'b1', strategy: 'dense', label: 'BGE-base dense, 400/80', weights: [1, 0] },
  { id: 'qwen-400h-dense', a: 'a4', b: 'b4', strategy: 'dense', label: 'Qwen dense, 400/80 + header', weights: [1, 0] },
  { id: 'qwen-400h-hybrid', a: 'a4', b: 'b4', strategy: 'hybrid', label: 'Qwen hybrid 1:1, 400/80 + header', weights: [1, 1] },
  { id: 'qwen-400-weighted', a: 'a2', b: 'b4', strategy: 'hybrid', label: 'Qwen hybrid 3:1, 400/80', weights: [3, 1] },
  { id: 'qwen-800-weighted', a: 'a3', b: 'b4', strategy: 'hybrid', label: 'Qwen hybrid 3:1, 800/150', weights: [3, 1] },
];
const models = {
  b1: { model: 'hf.co/CompendiumLabs/bge-base-en-v1.5-gguf:latest', prefix: 'Represent this sentence for searching relevant passages: ' },
  b4: { model: 'qwen3-embedding:0.6b', prefix: "Instruct: Given an analyst's question about impact evidence, retrieve passages that report a relevant outcome, indicator, measurement or finding.\nQuery: " },
};
const judgeRubric = [
  "You judge whether a passage is relevant to an analyst's question about impact evidence.", '',
  'A passage is relevant ONLY if it contains specific information that helps answer the',
  'question: a reported outcome, an indicator or measure, a quantity, a target, a',
  "commitment, or a finding on the question's subject.", '',
  'A passage is NOT relevant if it merely mentions the topic in passing, or if it is a',
  'table of contents, a heading list, a reference list, an acknowledgement, a disclaimer,',
  'boilerplate, or page furniture.', '',
  'The passages are in no meaningful order. Judge each on its own merits.',
  'Return one verdict per passage, using the passage numbers shown.',
].join('\n');
const ratingRubric = [
  "You rate how well each passage answers an analyst's question.", '',
  'Relevance means the passage contains specific information that helps answer the',
  'question: a reported outcome, an indicator or measure, a quantity, a target, a',
  "commitment, or a finding on the question's subject.", '',
  'Passages that merely mention the topic, or that are tables of contents, heading',
  'lists, reference lists, acknowledgements, disclaimers or page furniture, are not',
  'relevant however well their wording matches.', '',
  'Rate each passage from 0 (no relevant information) to 10 (directly and',
  'specifically answers the question). Rate every passage independently.',
].join('\n');
async function request(url, data) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { ...(data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(300000) });
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return await r.json();
    } catch (error) {
      if (attempt >= 2) throw error;
      await delay(1000);
    }
  }
}
const started = performance.now();
const tags = (await request(ollama + '/api/tags')).models;
const required = [model, ...Object.values(models).map(m => m.model)];
const digests = Object.fromEntries(required.map(name => {
  const found = tags.find(m => m.name === name);
  if (!found) throw new Error('Missing local model: ' + name);
  return [name, found.digest];
}));
const indexInfo = {};
for (const c of configs) {
  const collection = `m4i_x_${c.a}_${c.b}`;
  if (indexInfo[collection]) continue;
  const info = (await request(qdrant + '/collections/' + collection)).result;
  if (info.points_count !== chunks(c.a).size) throw new Error('Index size differs from cached corpus: ' + collection);
  indexInfo[collection] = { count: info.points_count, vectors: info.config.params.vectors };
}
const plain = chunks('a2'), contextual = chunks('a4');
if (plain.size !== contextual.size || [...plain].some(([id, c]) => !contextual.has(id) ||
  !contextual.get(id).text.endsWith(c.text) || !/^\[Document:.*\| Source:.*\| Page \d+\]\s*$/s.test(contextual.get(id).text.slice(0, -c.text.length)))) {
  throw new Error('400-word indexes do not share the same chunks; cannot use a common denominator');
}
const corpusHashes = Object.fromEntries(['a2', 'a3', 'a4'].map(a => [a, hash(JSON.stringify([...chunks(a)].map(([id, c]) => [id, c.text])))]));
const fingerprint = hash(JSON.stringify({ version: 1, questions, configs, depths, maxDepth, models, digests, indexInfo, corpusHashes, judgeRubric, ratingRubric, context: 16384, batch: 4 }));
const cachePath = OUT + 'depth-cache-' + fingerprint + '.json';
const state = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : { vectors: {}, legs: {}, judgments: {}, ratings: {}, timing: [], invalid: [] };
async function persist() {
  for (let attempt = 0; ; attempt++) {
    try {
      writeFileSync(cachePath + '.tmp', JSON.stringify(state));
      renameSync(cachePath + '.tmp', cachePath);
      return;
    } catch (error) {
      if (attempt >= 4) throw error;
      await delay(100 * (attempt + 1));
    }
  }
}
const inherited = { ...labels };
const inheritedSources = [{ source: 'original judge-cache', labels: Object.keys(labels).length }];
const priorSummaryPath = OUT + 'live-ontology.json';
if (existsSync(priorSummaryPath)) {
  const prior = JSON.parse(readFileSync(priorSummaryPath, 'utf8'));
  const path = OUT + 'live-cache-' + prior.fingerprint + '.json';
  if (prior.modelDigest === digests[model] && existsSync(path)) {
    const old = JSON.parse(readFileSync(path, 'utf8'));
    Object.assign(inherited, old.judgments);
    inheritedSources.push({ source: prior.fingerprint, labels: Object.keys(old.judgments).length });
  }
}
const legKey = (c, q, type) => `${c.a}.${c.b}:${q.questionId}:${type}`;
function materialize(c, hits) {
  return hits.map(hit => {
    const stored = chunks(c.a).get(hit.chunkId);
    if (!stored) throw new Error('Missing corpus chunk ' + hit.chunkId);
    // A title can contain ']'. The old header regex stops too early for nine
    // chunks. Match the verified original body instead of parsing that header.
    return { ...hit, body: c.a === 'a4' ? plain.get(hit.chunkId).text : stored.text, documentId: stored.documentId, page: stored.page };
  });
}
function ranking(c, q, legDepth = maxDepth, limit = maxDepth) {
  const dense = materialize(c, state.legs[legKey(c, q, 'dense')]).slice(0, legDepth);
  if (c.strategy === 'dense') return dense.slice(0, limit);
  const sparse = materialize(c, state.legs[legKey(c, q, 'sparse')]).slice(0, legDepth);
  return fuse([dense, sparse], c.weights, 60, limit);
}
for (const b of ['b1', 'b4']) {
  for (let offset = 0; offset < questions.length; offset += 8) {
    const pending = questions.slice(offset, offset + 8).filter(q => !state.vectors[`${b}:${q.questionId}`]);
    if (!pending.length) continue;
    const t = performance.now();
    const response = await request(ollama + '/api/embed', { model: models[b].model, input: pending.map(q => models[b].prefix + q.question), truncate: false });
    if (response.embeddings.length !== pending.length) throw new Error('Incomplete embeddings');
    pending.forEach((q, i) => { state.vectors[`${b}:${q.questionId}`] = response.embeddings[i]; });
    state.timing.push({ phase: 'embed', model: models[b].model, count: pending.length, ms: performance.now() - t });
    await persist();
  }
  console.log(`[depth] Query embeddings ready: ${models[b].model}`);
}
for (const c of configs) {
  for (const q of questions) for (const type of c.strategy === 'dense' ? ['dense'] : ['dense', 'sparse']) {
    const k = legKey(c, q, type);
    if (state.legs[k]) continue;
    const t = performance.now();
    const query = type === 'dense' ? state.vectors[`${c.b}:${q.questionId}`] : { text: q.question, model: 'qdrant/bm25', options: { language: 'english' } };
    const response = await request(`${qdrant}/collections/m4i_x_${c.a}_${c.b}/points/query`, { query, using: type, limit: maxDepth, with_payload: true });
    const hits = response.result.points.map(p => {
      const stored = chunks(c.a).get(p.payload.chunkId);
      if (!stored || stored.text !== p.payload.text) throw new Error('Live corpus does not match snapshot');
      return { chunkId: p.payload.chunkId, score: p.score };
    });
    if (hits.length !== maxDepth || new Set(hits.map(c => c.chunkId)).size !== maxDepth) throw new Error('Incomplete or duplicated retrieval');
    state.legs[k] = hits;
    state.timing.push({ phase: 'retrieve', config: c.id, type, ms: performance.now() - t });
    await persist();
  }
  console.log(`[depth] 80-deep retrieval ready: ${c.id}`);
}
// Union includes changed RRF memberships at leg depths 20 and 40 as well as 80.
const pendingByQuery = new Map();
const oldPools = ['a2', 'a3', 'a4'].flatMap(a => [1, 2, 3, 4].flatMap(b => [1, 2, 3].map(c => ({ a, list: new Map(read(`pool-${a}.b${b}.c${c}`).map(q => [q.questionId, q])) }))));
for (const q of questions) {
  const union = new Map();
  for (const p of oldPools) for (const passage of materialize({ a: p.a }, p.list.get(q.questionId).retrieved)) union.set(key(q.questionId, passage.body), passage);
  for (const c of configs) for (const n of [20, 40, 80]) for (const passage of ranking(c, q, n, n)) {
    union.set(key(q.questionId, passage.body), passage);
  }
  pendingByQuery.set(q.questionId, [...union].filter(([k]) => inherited[k] === undefined && state.judgments[k] === undefined));
}
console.log(`[depth] New relevance judgments needed: ${[...pendingByQuery.values()].reduce((s, a) => s + a.length, 0)}`);
async function infer(q, batch, mode) {
  const judge = mode === 'judge';
  const field = judge ? 'verdicts' : 'ratings', valueField = judge ? 'relevant' : 'relevance';
  const schema = { type: 'object', additionalProperties: false, required: [field], properties: {
    [field]: { type: 'array', minItems: batch.length, maxItems: batch.length, items: { type: 'object', additionalProperties: false,
      required: ['passage', valueField], properties: { passage: { type: 'integer', minimum: 1, maximum: batch.length },
        [valueField]: judge ? { type: 'boolean' } : { type: 'number', minimum: 0, maximum: 10 } } } },
  } };
  const listing = batch.map(([, c], i) => `[Passage ${i + 1}]\n${judge ? c.body : c.body.trim().split(/\s+/).slice(0, 220).join(' ')}`).join('\n\n');
  for (let attempt = 0; attempt < 3; attempt++) {
    const t = performance.now();
    const response = await request(ollama + '/api/chat', { model, stream: false, think: false, format: schema,
      messages: [{ role: 'system', content: judge ? judgeRubric : ratingRubric },
        { role: 'user', content: `Question: ${q.question}\n\n${listing}\n\n${judge ? 'Judge' : 'Rate'} all ${batch.length} passages.` }],
      options: { temperature: 0, seed: 20260909, num_ctx: 16384, num_predict: 1024 },
    });
    state.timing.push({ phase: mode, questionId: q.questionId, passages: batch.length, ms: performance.now() - t,
      promptTokens: response.prompt_eval_count, outputTokens: response.eval_count });
    let parsed;
    try { parsed = JSON.parse(response.message.content)[field]; } catch { parsed = null; }
    const valid = Array.isArray(parsed) && parsed.length === batch.length && new Set(parsed.map(v => v.passage)).size === batch.length && parsed.every(v =>
      Number.isInteger(v.passage) && v.passage >= 1 && v.passage <= batch.length &&
      (judge ? typeof v[valueField] === 'boolean' : Number.isFinite(v[valueField]) && v[valueField] >= 0 && v[valueField] <= 10));
    if (valid) {
      for (const v of parsed) {
        const [k, c] = batch[v.passage - 1];
        if (judge) state.judgments[k] = v.relevant;
        else (state.ratings[q.questionId] ??= {})[c.chunkId] = v.relevance / 10;
      }
      await persist();
      return;
    }
    state.invalid.push({ phase: mode, questionId: q.questionId, content: response.message.content });
    await persist();
  }
  if (batch.length === 1) throw new Error('Invalid singleton model response: ' + q.questionId);
  const middle = Math.ceil(batch.length / 2);
  await infer(q, batch.slice(0, middle), mode);
  await infer(q, batch.slice(middle), mode);
}
for (const [i, q] of questions.entries()) {
  const pending = pendingByQuery.get(q.questionId).sort((a, b) => a[0].localeCompare(b[0]));
  for (let offset = 0; offset < pending.length; offset += 4) await infer(q, pending.slice(offset, offset + 4), 'judge');
  console.log(`[depth judge] ${i + 1}/42 ${q.questionId}; total new labels ${Object.keys(state.judgments).length}`);
}
const rerankConfig = configs.find(c => c.id === 'qwen-400h-hybrid');
for (const [i, q] of questions.entries()) {
  const pool = ranking(rerankConfig, q);
  // Keep complete original batches stable across resumptions.
  for (let offset = 0; offset < pool.length; offset += 4) {
    const batch = pool.slice(offset, offset + 4);
    if (batch.every(c => Number.isFinite(state.ratings[q.questionId]?.[c.chunkId]))) continue;
    await infer(q, batch.map(c => [c.chunkId, c]), 'rating');
  }
  console.log(`[depth rerank] ${i + 1}/42; 80 validated ratings`);
}
const allLabels = { ...inherited, ...state.judgments };
const label = (q, ranked) => ranked.map(c => {
  const relevant = allLabels[key(q.questionId, c.body)];
  if (typeof relevant !== 'boolean') throw new Error('Missing judgment');
  return { ...c, relevant };
});
const denominators = {};
for (const q of questions) {
  const unions = { '400': new Map(), '800': new Map() };
  for (const p of oldPools) for (const c of materialize({ a: p.a }, p.list.get(q.questionId).retrieved)) unions[p.a === 'a3' ? '800' : '400'].set(c.chunkId, c);
  for (const c of configs) for (const n of [20, 40, 80]) for (const p of ranking(c, q, n, n)) unions[c.a === 'a3' ? '800' : '400'].set(p.chunkId, p);
  denominators[q.questionId] = Object.fromEntries(Object.entries(unions).map(([group, passages]) => [group, {
    judged: passages.size, relevant: label(q, [...passages.values()]).filter(c => c.relevant).length,
  }]));
}
const totalFor = (q, c) => denominators[q.questionId][c.a === 'a3' ? '800' : '400'].relevant;
function summarizeRun(id, config, k, rows, extra = {}) {
  return { id, config, k, ...extra, summary: aggregateDepth(rows), rows,
    byDimension: [...new Set(questions.map(q => q.dimensionId))].map(dimensionId => ({ dimensionId, ...aggregateDepth(rows.filter(r => r.dimensionId === dimensionId)) })) };
}
const curves = [];
for (const c of configs) for (const k of depths) {
  const rows = questions.map(q => depthMetrics(q, label(q, ranking(c, q)), k, totalFor(q, c)));
  curves.push(summarizeRun(c.id + '-k' + k, c.id, k, rows));
}
for (const c of configs) {
  const baseline = curves.find(r => r.config === c.id && r.k === 20);
  for (const curve of curves.filter(r => r.config === c.id)) curve.deltaVs20 = Object.fromEntries(['precision', 'recall', 'relevant', 'uniqueRelevantPages', 'words'].map(m => [m, pairedInterval(curve.rows, baseline.rows, m)]));
  for (const q of questions) {
    const series = curves.filter(r => r.config === c.id).map(r => r.rows.find(row => row.questionId === q.questionId));
    if (series.some((r, i) => i && r.recall < series[i - 1].recall)) throw new Error('Non-monotonic fixed-list recall');
  }
}
const legDepths = [];
for (const c of configs.filter(c => c.strategy === 'hybrid')) for (const n of [20, 40, 80]) {
  const rows = questions.map(q => depthMetrics(q, label(q, ranking(c, q, n, 20)), 20, totalFor(q, c)));
  legDepths.push(summarizeRun(`${c.id}-leg${n}`, c.id, 20, rows, { legDepth: n }));
}
const reranking = [], conformal = [];
for (const n of [20, 40, 80]) {
  const scored = questions.map(q => ({ ...q, retrieved: scorePrefix(label(q, ranking(rerankConfig, q)), state.ratings[q.questionId], n) }));
  for (const k of depths.filter(k => k <= n)) reranking.push(summarizeRun(`pointwise-c${n}-k${k}`, 'qwen-400h-hybrid-pointwise', k,
    scored.map(q => depthMetrics(q, q.retrieved, k, totalFor(q, rerankConfig))), { candidates: n }));
  for (const alpha of [.05, .1, .2]) {
    const rows = [], selections = [];
    for (const f of folds(scored)) {
      const fitted = crcThreshold(f.train, alpha);
      selections.push({ fold: f.fold, calibrationQuestions: f.train.length, evaluationQuestions: f.test.length, ...fitted });
      for (const q of f.test) {
        const retained = q.retrieved.filter(c => c.score >= fitted.threshold);
        const relevantTotal = q.retrieved.filter(c => c.relevant).length;
        rows.push({ ...depthMetrics(q, retained, retained.length, totalFor(q, rerankConfig)),
          candidateRecallLoss: relevantTotal ? 1 - retained.filter(c => c.relevant).length / relevantTotal : 0 });
      }
    }
    conformal.push({ candidates: n, alpha, selections, summary: aggregateDepth(rows),
      candidateRecallLoss: rows.reduce((s, r) => s + r.candidateRecallLoss, 0) / rows.length, rows });
  }
}
const result = { generatedAt: new Date().toISOString(), fingerprint, questions, configurations: configs, models, digests, corpusHashes, indexInfo,
  inheritedSources, newJudgments: Object.keys(state.judgments).length, freshRatings: Object.values(state.ratings).reduce((s, r) => s + Object.keys(r).length, 0),
  invalidResponses: state.invalid.length, secondsThisInvocation: (performance.now() - started) / 1000,
  inferenceSettings: { model, context: 16384, temperature: 0, seed: 20260909, ratingPassageWords: 220, batchSize: 4 },
  timing: ['embed', 'retrieve', 'judge', 'rating'].map(phase => ({ phase, calls: state.timing.filter(t => t.phase === phase).length,
    seconds: state.timing.filter(t => t.phase === phase).reduce((s, t) => s + t.ms, 0) / 1000 })),
  denominators, curves, legDepths, reranking, conformal,
  caveats: ['Exploratory, 42 previously used questions; six per dimension.', 'Primary labels and reranker both Qwen; no answer-quality experiment.',
    'Recall is relative to a fixed enlarged chunk-ID union, with separate 400- and 800-word denominators.',
    'Legacy judgments use old context defaults; new judgments use explicit 16K context.',
    'Reranking is fresh and strictly validated; depth comparisons share its scores. Old reranker scores are not controls.',
    'Candidate depth analysis uses prefixes of rankings retrieved once to depth 80; new database queries at smaller limits may differ.'],
};
writeFileSync(OUT + 'depth-results.json', JSON.stringify(result, null, 2));
console.log(`[depth complete] ${result.newJudgments} new judgments; ${result.freshRatings} fresh ratings. Results: ${OUT}depth-results.json`);
