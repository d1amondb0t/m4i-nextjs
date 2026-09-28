import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { OUT, read, save, hash, key, labels, chunks, body, words, fuse, totalsFor, decorate, evaluate, summary, pairedInterval, tuneRanking } from './common.mjs';

const model = 'qwen3.5:9b-q4_K_M';
const ollama = process.env.OLLAMA_HOST || 'http://localhost:11434';
const qdrant = 'http://localhost:6333';
const collection = 'm4i_x_a4_b4';
const rubric = [
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
const schema = {
  type: 'object', additionalProperties: false, required: ['verdicts'], properties: {
    verdicts: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['passage', 'relevant'],
        properties: { passage: { type: 'integer' }, relevant: { type: 'boolean' } }
      }
    }
  }
};
async function request(url, data) {
  const response = await fetch(url, { ...(data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(300000) });
  if (!response.ok) throw new Error(`${url}: ${response.status} ${await response.text()}`);
  return response.json();
}
const started = performance.now();
const ontology = JSON.parse(readFileSync(new URL('../ontology.json', import.meta.url), 'utf8'));
const categories = new Map(ontology.dimensions.flatMap(d => d.categories.map(c => [c.id, c])));
const dense = read('pool-a4.b4.c1'), sparse = read('pool-a4.b4.c2');
const tags = await request(ollama + '/api/tags');
const modelInfo = tags.models.find(m => m.name === model);
if (!modelInfo) throw new Error('Required local judge model is missing');
const index = (await request(qdrant + '/collections/' + collection)).result;
if (index.points_count !== chunks('a4').size) throw new Error('Live index size differs from frozen corpus');
const fingerprint = hash(JSON.stringify({ ontology, dense, sparse, rubric, model: modelInfo.digest, context: 16384, indexSize: index.points_count, protocol: 1 }));
const cachePath = OUT + 'live-cache-' + fingerprint + '.json';
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : { expansions: {}, judgments: {}, timings: [] };
const persist = async () => {
  for (let attempt = 0; ; attempt++) {
    try {
      writeFileSync(cachePath + '.tmp', JSON.stringify(cache));
      renameSync(cachePath + '.tmp', cachePath);
      return;
    } catch (error) {
      if (attempt >= 4) throw error;
      await delay(100 * (attempt + 1));
    }
  }
};
for (const [id, c] of categories) {
  if (cache.expansions[id]) continue;
  const query = [c.name, ...(c.include ?? [])].join('. ');
  const start = performance.now();
  const response = await request(qdrant + '/collections/' + collection + '/points/query', {
    query: { text: query, model: 'qdrant/bm25', options: { language: 'english' } },
    using: 'sparse', limit: 20, with_payload: true,
  });
  cache.expansions[id] = response.result.points.map(p => {
    const local = chunks('a4').get(p.payload.chunkId);
    if (!local || local.text !== p.payload.text) throw new Error('Live chunk differs from frozen chunk');
    return { chunkId: p.payload.chunkId, body: body(p.payload.text), score: p.score };
  });
  cache.timings.push({ category: id, retrievalMs: performance.now() - start });
  await persist();
}
const configurations = [
  { id: 'original-rrf60', weights: [1, 1, 0] },
  { id: 'ontology-add-0.25', weights: [1, 1, 0.25] },
  { id: 'ontology-add-0.5', weights: [1, 1, 0.5] },
  { id: 'ontology-replace-sparse', weights: [1, 0, 1] },
];
const pools = new Map(configurations.map(config => [config.id, dense.map((q, i) => ({
  ...q,
  retrieved: fuse([q.retrieved, sparse[i].retrieved, cache.expansions[q.categoryId]], config.weights),
}))]));
async function judge(q, batch) {
  const listing = batch.map(([, c], j) => `[Passage ${j + 1}]\n${c.body}`).join('\n\n');
  const t = performance.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await request(ollama + '/api/chat', {
      model, stream: false, think: false, format: schema,
      messages: [{ role: 'system', content: rubric }, { role: 'user', content: `Question: ${q.question}\n\n${listing}\n\nJudge all ${batch.length} passages.` }],
      options: { temperature: 0, seed: 20260909, num_ctx: 16384, num_predict: 1024 }
    });
    let parsed;
    try { parsed = JSON.parse(response.message.content).verdicts; } catch { parsed = null; }
    if (!Array.isArray(parsed) || parsed.length !== batch.length || new Set(parsed.map(v => v.passage)).size !== batch.length ||
      parsed.some(v => !Number.isInteger(v.passage) || v.passage < 1 || v.passage > batch.length || typeof v.relevant !== 'boolean')) {
      (cache.invalidResponses ??= []).push({ questionId: q.questionId, passages: batch.length, content: response.message.content });
      await persist();
      continue;
    }
    for (const v of parsed) cache.judgments[batch[v.passage - 1][0]] = v.relevant;
    cache.timings.push({
      questionId: q.questionId, judgeMs: performance.now() - t, passages: batch.length,
      promptTokens: response.prompt_eval_count, outputTokens: response.eval_count, passageWords: words(listing)
    });
    return;
  }
  if (batch.length === 1) throw new Error('Judge response incomplete after singleton retries: ' + q.questionId);
  const middle = Math.ceil(batch.length / 2);
  await judge(q, batch.slice(0, middle));
  await judge(q, batch.slice(middle));
}
let newlyJudged = 0;
for (const [i, q] of dense.entries()) {
  const union = new Map([...pools.values()].flatMap(list => list[i].retrieved).map(c => [key(q.questionId, c.body), c]));
  const pending = [...union].filter(([k]) => labels[k] === undefined && cache.judgments[k] === undefined);
  for (let start = 0; start < pending.length; start += 4) {
    const batch = pending.slice(start, start + 4).sort((a, b) => a[0].localeCompare(b[0]));
    await judge(q, batch);
    newlyJudged += batch.length;
    await persist();
  }
  if ((i + 1) % 7 === 0 || pending.length) console.log(`[ontology] ${i + 1}/84 questions; ${newlyJudged} new judgments this run`);
}
const allLabels = { ...labels, ...cache.judgments };
const totals = totalsFor('a4', allLabels, [...pools.values()]);
const decorated = new Map([...pools].map(([id, list]) => [id, list.map(q => ({ ...q, retrieved: q.retrieved.map(c => decorate(q, c, 'a4', allLabels)) }))]));
const baselineRows = evaluate(decorated.get('original-rrf60'), q => q.retrieved, totals);
const variants = [...decorated].map(([id, list]) => {
  const rows = evaluate(list, q => q.retrieved, totals);
  return { id, summary: summary(rows), ndcgDelta: pairedInterval(rows, baselineRows, 'ndcg10'), precisionDelta: pairedInterval(rows, baselineRows, 'p5'), rows };
});
const byQuery = new Map([...decorated].map(([id, list]) => [id, new Map(list.map(q => [q.questionId, q]))]));
const cv = tuneRanking(decorated.get('original-rrf60'), configurations.map(c => c.id), (q, id) => byQuery.get(id).get(q.questionId).retrieved, totals);
const result = {
  generatedAt: new Date().toISOString(), fingerprint, model, modelDigest: modelInfo.digest,
  judgeContext: 16384, invalidResponsesRetried: cache.invalidResponses?.length ?? 0,
  newJudgments: Object.keys(cache.judgments).length, cachedOriginalJudgments: Object.keys(labels).length,
  collection, points: index.points_count, secondsThisRun: (performance.now() - started) / 1000,
  timing: {
    retrievalMs: cache.timings.filter(t => t.retrievalMs).reduce((s, t) => s + t.retrievalMs, 0),
    judgeMs: cache.timings.filter(t => t.judgeMs).reduce((s, t) => s + t.judgeMs, 0)
  },
  configurations, variants, crossValidated: { ...cv, ndcgDelta: pairedInterval(cv.rows, baselineRows, 'ndcg10'), precisionDelta: pairedInterval(cv.rows, baselineRows, 'p5') },
  limitations: ['Previously explored benchmark; no fresh final test set.', 'Qwen primary labels; new labels use explicit 16K context, old labels used default context.', 'Only ontology inclusion vocabulary; not a full graph or ontology rewrite.', 'Pooled recall is conditional on the enlarged judged union, not exhaustive corpus recall.']
};
save('live-ontology', result);
console.log(JSON.stringify({ variants: variants.map(({ id, summary, ndcgDelta }) => ({ id, summary, ndcgDelta })), crossValidated: result.crossValidated.summary }, null, 2));
