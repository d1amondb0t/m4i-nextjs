import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../results/experiment/', import.meta.url));
export const OUT = fileURLToPath(new URL('../results/review/', import.meta.url));
mkdirSync(OUT, { recursive: true });
export const read = name => JSON.parse(readFileSync(ROOT + name + '.json', 'utf8'));
export const save = (name, value) => writeFileSync(OUT + name + '.json', JSON.stringify(value, null, 2));
export const hash = value => createHash('sha1').update(value).digest('hex');
export const key = (q, body) => hash(`${q}\0${body.replace(/\s+/g, ' ').trim()}`);
export const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
export const category = q => q.questionId.split('#')[0];
export const words = text => text.trim().split(/\s+/).filter(Boolean).length;
export const body = text => text.replace(/^\[Document:[^\]]*\]\s*/, '');
export const labels = read('judge-cache');
const corpora = new Map();
export function chunks(a) {
  if (!corpora.has(a)) corpora.set(a, new Map(read('chunks-' + a).chunks.map(c => [c.chunkId, c])));
  return corpora.get(a);
}
export function decorate(q, c, a, cache = labels) {
  const text = c.body ?? body(chunks(a).get(c.chunkId).text);
  const k = key(q.questionId, text);
  if (typeof cache[k] !== 'boolean') throw new Error(`Unjudged passage: ${q.questionId}/${c.chunkId}`);
  const metadata = chunks(a).get(c.chunkId);
  if (!metadata) throw new Error('Missing chunk metadata: ' + c.chunkId);
  return { ...c, body: text, relevant: cache[k], documentId: metadata.documentId, page: metadata.page };
}
export function loadPool(id) {
  const a = id.split('.')[0];
  return read('pool-' + id).map(q => ({ ...q, retrieved: q.retrieved.map(c => decorate(q, c, a)) }));
}
export function loadScored(id) {
  const a = id.split('.')[0];
  return read('scored-' + id).map(q => ({ ...q, retrieved: q.observations.map(c => decorate(q, c, a)) }));
}
export function totalsFor(a, cache = labels, extra = []) {
  const questions = new Map();
  for (const list of [...Array.from({ length: 4 }, (_, i) => i + 1).flatMap(b =>
    [1, 2, 3].map(c => read(`pool-${a}.b${b}.c${c}`))), ...extra]) {
    for (const q of list) {
      if (!questions.has(q.questionId)) questions.set(q.questionId, new Map());
      for (const c of q.retrieved) {
        const k = key(q.questionId, c.body);
        if (typeof cache[k] !== 'boolean') throw new Error('Missing pooled judgment: ' + k);
        questions.get(q.questionId).set(k, cache[k]);
      }
    }
  }
  return new Map([...questions].map(([id, judgments]) => [id, [...judgments.values()].filter(Boolean).length]));
}
export function metrics(q, ranked, total) {
  const relevant = ranked.filter(c => c.relevant);
  const discount = i => 1 / Math.log2(i + 2);
  const dcg = ranked.slice(0, 10).reduce((s, c, i) => s + (c.relevant ? discount(i) : 0), 0);
  const ideal = Array.from({ length: Math.min(10, total) }, (_, i) => discount(i)).reduce((a, b) => a + b, 0);
  return {
    questionId: q.questionId, category: category(q),
    p5: ranked.slice(0, 5).filter(c => c.relevant).length / 5,
    ndcg10: ideal ? dcg / ideal : 0,
    recall20: total ? ranked.slice(0, 20).filter(c => c.relevant).length / total : 0,
    precision: ranked.length ? relevant.length / ranked.length : 0,
    relevant: relevant.length, count: ranked.length, coverage: ranked.length ? 1 : 0,
    uniqueRelevantPages: new Set(relevant.map(c => `${c.documentId}/${c.page}`)).size,
    words: ranked.reduce((s, c) => s + words(c.body), 0),
  };
}
export function summary(rows) {
  const names = ['p5', 'ndcg10', 'recall20', 'precision', 'relevant', 'count', 'coverage', 'uniqueRelevantPages', 'words'];
  return { questions: rows.length, ...Object.fromEntries(names.map(k => [k, mean(rows.map(r => r[k]))])),
    conditionalPrecision: mean(rows.filter(r => r.count).map(r => r.precision)),
    microPrecision: rows.reduce((s, r) => s + r.relevant, 0) / (rows.reduce((s, r) => s + r.count, 0) || 1) };
}
export function fuse(lists, weights, k = 60, limit = 20) {
  const merged = new Map();
  lists.forEach((list, j) => {
    if (!weights[j]) return;
    const seen = new Set();
    list.forEach((c, i) => {
      if (seen.has(c.chunkId)) return;
      seen.add(c.chunkId);
      const current = merged.get(c.chunkId) ?? { ...c, score: 0 };
      current.score += weights[j] / (k + i + 1);
      merged.set(c.chunkId, current);
    });
  });
  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
export function rng(seed = 20260909) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function pairedInterval(rows, baseline, metric) {
  const byId = new Map(baseline.map(r => [r.questionId, r]));
  const groups = new Map();
  for (const r of rows) {
    if (!byId.has(r.questionId)) throw new Error('Unpaired query');
    if (!groups.has(r.category)) groups.set(r.category, []);
    groups.get(r.category).push(r[metric] - byId.get(r.questionId)[metric]);
  }
  const values = [...groups.values()], random = rng();
  const samples = Array.from({ length: 2000 }, () => mean(values.flatMap(() => values[Math.floor(random() * values.length)]))).sort((a, b) => a - b);
  return { delta: mean([...groups.values()].flat()), lower: samples[50], upper: samples[1949] };
}
export function folds(questions) {
  const groups = [...new Set(questions.map(category))].sort((a, b) => hash(a).localeCompare(hash(b)));
  return Array.from({ length: 7 }, (_, fold) => {
    const testGroups = new Set(groups.filter((_, i) => i % 7 === fold));
    return { fold, train: questions.filter(q => !testGroups.has(category(q))), test: questions.filter(q => testGroups.has(category(q))) };
  });
}
export function evaluate(questions, rank, totals) {
  return questions.map(q => metrics(q, rank(q), totals.get(q.questionId)));
}
export function tuneRanking(questions, variants, rank, totals, metric = 'ndcg10') {
  const rows = [], selections = [];
  for (const f of folds(questions)) {
    const scored = variants.map(v => ({ v, score: mean(evaluate(f.train, q => rank(q, v), totals).map(r => r[metric])) }));
    scored.sort((a, b) => b.score - a.score);
    const winner = scored[0];
    selections.push({ fold: f.fold, categories: [...new Set(f.test.map(category))], configuration: winner.v, trainScore: winner.score });
    rows.push(...evaluate(f.test, q => rank(q, winner.v), totals));
  }
  return { rows, selections, summary: summary(rows) };
}
export function adaptive(ranked, config) {
  const ordered = [...ranked].sort((a, b) => b.score - a.score);
  if (!ordered.length || ordered[0].score < config.reject) return [];
  const threshold = ordered[0].score >= config.accept ? config.accept : config.reject;
  const count = ordered.filter(c => c.score >= threshold && c.score >= ordered[0].score * config.dropoff).length;
  return ordered.slice(0, Math.min(Math.max(count, config.min), config.max));
}
export function conformalLower(scores, alpha) {
  const sorted = [...scores].sort((a, b) => a - b);
  const rank = Math.floor(alpha * (scores.length + 1));
  return rank < 1 ? -Infinity : sorted[rank - 1];
}
export function crcThreshold(questions, alpha) {
  const thresholds = [...new Set([0, ...questions.flatMap(q => q.retrieved.map(c => c.score))])].sort((a, b) => b - a);
  for (const threshold of thresholds) {
    const losses = questions.map(q => {
      const positive = q.retrieved.filter(c => c.relevant);
      return positive.length ? positive.filter(c => c.score < threshold).length / positive.length : 0;
    });
    const bound = (losses.reduce((a, b) => a + b, 0) + 1) / (questions.length + 1);
    if (bound <= alpha) return { threshold, correctedCalibrationRisk: bound, supported: true };
  }
  return { threshold: 0, correctedCalibrationRisk: 1 / (questions.length + 1), supported: false };
}
