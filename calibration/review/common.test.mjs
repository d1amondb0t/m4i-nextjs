import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { adaptive, crcThreshold, folds, fuse, metrics, pairedInterval } from './common.mjs';

const q = { questionId: 'category#1' };
const c = (id, relevant, score = 1) => ({ chunkId: id, relevant, score, documentId: 'doc', page: 1, body: 'evidence' });
test('P@5 uses five slots; abstentions count as zero precision and coverage', () => {
  assert.equal(metrics(q, [c('a', true)], 2).p5, .2);
  assert.equal(metrics(q, [], 2).precision, 0);
  assert.equal(metrics(q, [], 2).coverage, 0);
});
test('RRF excludes a zero-weight leg and does not count duplicate IDs twice', () => {
  const fused = fuse([[c('a', true), c('a', true)], [c('b', true)]], [1, 0]);
  assert.deepEqual(fused.map(c => c.chunkId), ['a']);
  assert.equal(fused[0].score, 1 / 61);
});
test('category siblings never cross outer train/test boundaries', () => {
  const questions = Array.from({ length: 21 }, (_, i) => Array.from({ length: 4 }, (_, j) => ({ questionId: `c${i}#${j}` }))).flat();
  const split = folds(questions);
  assert.equal(new Set(split.flatMap(f => f.test.map(q => q.questionId))).size, 84);
  for (const f of split) {
    const train = new Set(f.train.map(q => q.questionId.split('#')[0]));
    assert.ok(f.test.every(q => !train.has(q.questionId.split('#')[0])));
    assert.equal(f.train.length, 72);
  }
});
test('CRC measures query recall loss, including low-scoring relevant items', () => {
  const qs = Array.from({ length: 39 }, () => ({ retrieved: [c('a', true, .9), c('b', true, .2), c('c', false, .1)] }));
  const fit = crcThreshold(qs, .05);
  assert.equal(fit.threshold, .2);
  assert.equal(fit.correctedCalibrationRisk, 1 / 40);
  assert.equal(crcThreshold(qs.slice(0, 2), .05).supported, false);
});
test('adaptive thresholds reject weak questions and keep ties in original order', () => {
  const config = { accept: .7, reject: .6, min: 1, max: 8, dropoff: .01 };
  assert.deepEqual(adaptive([c('a', true, .5)], config), []);
  assert.deepEqual(adaptive([c('a', true, .8), c('b', false, .8), c('c', true, .4)], config).map(c => c.chunkId), ['a', 'b']);
});
test('identical paired rows have a zero bootstrap interval', () => {
  const rows = [{ questionId: 'c#1', category: 'c', p5: .6 }];
  assert.deepEqual(pairedInterval(rows, rows, 'p5'), { delta: 0, lower: 0, upper: 0 });
});
test('offline adaptive selection matches the production implementation', () => {
  const source = readFileSync(new URL('../../app/server/rag/retrieval/adaptive-k.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exported = {};
  new Function('exports', compiled)(exported);
  for (const accept of [.5, .7, .9]) for (const min of [1, 3]) for (const max of [5, 8]) for (const dropoff of [.01, .75, .9]) {
    const config = { accept, reject: Math.min(.6, accept), min, max, dropoff };
    const observations = Array.from({ length: 20 }, (_, i) => c(String(i), i % 2 === 0, (i * 7 % 11) / 10));
    const production = exported.adaptiveSelect(observations.map(o => ({ chunk: { chunkId: o.chunkId }, score: o.score })), {
      acceptThreshold: config.accept, rejectThreshold: config.reject, minimumK: min, maximumK: max, relativeDropoff: dropoff,
    });
    assert.deepEqual(adaptive(observations, config).map(c => c.chunkId), production.selected.map(c => c.chunk.chunkId));
  }
});
