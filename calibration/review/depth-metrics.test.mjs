import assert from 'node:assert/strict';
import test from 'node:test';
import { depthMetrics, scorePrefix, aggregateDepth } from './depth-metrics.mjs';

const q = { questionId: 'topic#1', dimensionId: 'dimension' };
const chunk = (i, relevant) => ({ chunkId: String(i), documentId: 'doc', page: Math.floor(i / 2), body: 'some source evidence', relevant });
test('larger nested prefixes cannot decrease recall; precision can fall', () => {
  const ranked = Array.from({ length: 80 }, (_, i) => chunk(i, i < 4 || i % 10 === 0));
  const total = ranked.filter(c => c.relevant).length + 7;
  const rows = [5, 10, 20, 40, 80].map(k => depthMetrics(q, ranked, k, total));
  assert.ok(rows.every((r, i) => i === 0 || r.recall >= rows[i - 1].recall));
  assert.ok(rows[4].precision < rows[0].precision);
  assert.ok(rows[4].recall < 1);
  assert.equal(rows[1].ndcg10, rows[4].ndcg10);
  assert.equal(rows[0].p5, rows[4].p5);
});
test('the recall denominator stays fixed when output depth changes', () => {
  const ranked = [chunk(0, true), chunk(1, false), chunk(2, true)];
  assert.equal(depthMetrics(q, ranked, 1, 4).recall, .25);
  assert.equal(depthMetrics(q, ranked, 3, 4).recall, .5);
});
test('precision@k penalizes missing slots and rejects incomplete labels', () => {
  assert.equal(depthMetrics(q, [chunk(0, true)], 5, 2).precision, .2);
  assert.throws(() => depthMetrics(q, [chunk(0, undefined)], 5, 2), /Unjudged/);
  assert.throws(() => depthMetrics(q, [chunk(0, true), chunk(0, true)], 5, 2), /Duplicate/);
  assert.throws(() => depthMetrics(q, [chunk(0, true)], 5, 0), /denominator/);
});
test('reranking a deeper pool can improve the top few without rescoring', () => {
  const ranked = [chunk(0, false), chunk(1, false), chunk(2, true)];
  const scores = { 0: .2, 1: .1, 2: .9 };
  assert.equal(depthMetrics(q, scorePrefix(ranked, scores, 2), 1, 1).precision, 0);
  assert.equal(depthMetrics(q, scorePrefix(ranked, scores, 3), 1, 1).precision, 1);
  assert.deepEqual(ranked.map(c => c.chunkId), ['0', '1', '2']);
  assert.throws(() => scorePrefix(ranked, { 0: .2 }, 3), /Missing/);
});
test('page diversity distinguishes corroborating chunks on the same page', () => {
  const row = depthMetrics(q, [chunk(0, true), chunk(1, true), chunk(2, true)], 3, 5);
  assert.equal(row.relevant, 3);
  assert.equal(row.uniqueRelevantPages, 2);
  assert.equal(aggregateDepth([row, row]).recall, .6);
});
