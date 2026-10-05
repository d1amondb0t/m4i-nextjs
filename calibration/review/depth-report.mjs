import { readFileSync, writeFileSync } from 'node:fs';
import { OUT, pairedInterval, chunks, hash } from './common.mjs';

const result = JSON.parse(readFileSync(OUT + 'depth-results.json', 'utf8'));
const ontology = JSON.parse(readFileSync(new URL('../ontology.json', import.meta.url), 'utf8'));
const names = new Map(ontology.dimensions.map(d => [d.id, d.name]));
const chunkSizes = ['a2', 'a3'].map(partition => {
  const corpus = [...chunks(partition)];
  if (hash(JSON.stringify(corpus.map(([id, c]) => [id, c.text]))) !== result.corpusHashes[partition]) throw new Error('Corpus changed since depth run');
  const lengths = corpus.map(([, c]) => c.text.trim().split(/\s+/).length).sort((a, b) => a - b);
  return { partition, count: lengths.length, meanWords: lengths.reduce((s, n) => s + n, 0) / lengths.length,
    medianWords: lengths[Math.floor(lengths.length / 2)], maxWords: lengths.at(-1) };
});
const pct = v => (100 * v).toFixed(1) + '%';
const pp = v => Number((100 * v).toFixed(1)) === 0 ? '0.0' : (v > 0 ? '+' : '') + (100 * v).toFixed(1);
const interval = v => `${pp(v.delta)} [${pp(v.lower)}, ${pp(v.upper)}]`;
const num = v => v.toFixed(2);
const curve = (config, k) => result.curves.find(r => r.config === config && r.k === k);
const primaryRows = [...result.configurations].sort((a, b) => curve(b.id, 40).summary.precision - curve(a.id, 40).summary.precision).map(c => {
  const a = curve(c.id, 20), b = curve(c.id, 40), d = curve(c.id, 80);
  return `| ${c.label} | ${pct(a.summary.precision)} / ${pct(a.summary.recall)} | ${pct(b.summary.precision)} / ${pct(b.summary.recall)} | ${pct(d.summary.precision)} / ${pct(d.summary.recall)} | ${num(a.summary.relevant)} → ${num(d.summary.relevant)} | ${Math.round(a.summary.words)} → ${Math.round(d.summary.words)} |`;
}).join('\n');
const inferenceRows = result.reranking.map(r => `| ${r.candidates} | ${r.k} | ${pct(r.summary.precision)} | ${pct(r.summary.recall)} | ${pct(r.summary.p5)} | ${pct(r.summary.ndcg10)} | ${num(r.summary.relevant)} | ${Math.round(r.summary.words)} |`).join('\n');
const conformalRows = result.conformal.map(r => `| ${r.candidates} | ${pct(r.alpha)} | ${[...new Set(r.selections.map(s => s.threshold))].join(', ')} | ${pct(r.candidateRecallLoss)} | ${pct(r.summary.precision)} | ${num(r.summary.count)} | ${Math.round(r.summary.words)} |`).join('\n');
const bestAt = k => [...result.curves.filter(r => r.k === k && !r.config.includes('800'))].sort((a, b) => b.summary.recall - a.summary.recall)[0];
const deepTop5 = result.reranking.filter(r => r.k === 5).sort((a, b) => a.candidates - b.candidates);
const rerankDeltas = [[20, 40], [20, 80], [40, 80]].map(([baseline, candidates]) => ({ baseline, candidates,
  p5: pairedInterval(deepTop5.find(r => r.candidates === candidates).rows, deepTop5.find(r => r.candidates === baseline).rows, 'p5'),
  ndcg: pairedInterval(result.reranking.find(x => x.candidates === candidates && x.k === 10).rows,
    result.reranking.find(x => x.candidates === baseline && x.k === 10).rows, 'ndcg10') }));
const rerankVsRetrieval = deepTop5.map(r => ({ candidates: r.candidates,
  p5: pairedInterval(r.rows, curve('qwen-400h-hybrid', 5).rows, 'p5') }));
const legDepthDeltas = result.legDepths.filter(r => r.legDepth !== 20).map(r => ({ config: r.config, legDepth: r.legDepth,
  p5: pairedInterval(r.rows, result.legDepths.find(b => b.config === r.config && b.legDepth === 20).rows, 'p5') }));
let md = `# Larger retrieval pools: local experiment results\n\nGenerated ${new Date().toISOString()}.\n\n`;
md += `## Answer to the experiment question\n\n`;
md += `Increasing output k recovers more relevant chunks, but the useful comparison is the additional evidence versus precision and context cost. These runs separate output depth from candidate-pool depth. All 42 questions are paired across settings: two questions per category, six per ontology dimension. Aggregate rates are unweighted means over questions; evidence counts and context sizes are also per-query means.\n\n`;
md += `At k=40, the highest pooled recall among the comparable 400-word configurations is **${bestAt(40).config}** (${pct(bestAt(40).summary.recall)} recall, ${pct(bestAt(40).summary.precision)} precision). At k=80 it is **${bestAt(80).config}** (${pct(bestAt(80).summary.recall)} recall, ${pct(bestAt(80).summary.precision)} precision). The 800-word condition has its own relevance universe, so its recall is not ranked against the 400-word conditions.\n\n`;
md += '### Practical interpretation of this run\n\n';
md += '- **Evidence collection:** larger output sets help materially. Weighted Qwen with 400-word chunks is the strongest tested 400-word retrieval option at k=40/80. Choose 80 when coverage warrants the additional passages; it has no demonstrated recall plateau by rank 80, but precision declines.\n';
md += '- **Small top-five answers:** retain the 20-candidate reranking baseline when compute matters. Forty candidates has the best observed P@5 and nDCG@10, but its gain over 20 is uncertain; 80 does not improve top-five quality in this sample. Forty is a reasonable next operating point when retaining 10–20 passages, where it recovers more relevant evidence after reranking. This reranker comparison uses the header hybrid 1:1 configuration, not the weighted retrieval configuration.\n';
md += '- **Chunk length:** the 800-word setting gives only a small observed precision advantage over weighted 400-word retrieval, with substantially more context words. Its higher pooled recall percentage cannot establish superiority because the relevance units and denominator differ.\n';
md += '- **Conformal filtering:** 5% and 10% recall-loss targets retain every candidate at all three depths. A 20% target permits filtering, with observed candidate recall losses of 13.8–16.4%, but still leaves about 15/29/53 chunks at pool sizes 20/40/80. Enlarging the pool does not resolve the strict-target filtering limitation.\n';
md += '- **Ontology variation:** at a 40-candidate reranking depth, social P@5 rises from 80.0% to 96.7%, while humanitarian/law/rights falls from 86.7% to 73.3%. These six-question dimension samples do not support one universal winner or tuned per-dimension defaults.\n\n';
md += `## Returning more chunks: fixed rankings\n\nEach cell is **precision@k / recall@k**, with configurations ordered by precision@40. Every ranking is obtained with 80 candidates per retrieval leg; output prefixes are nested. This isolates the effect of returning more results. Context sizes count evidence-body words; prompts and provenance headers add overhead.\n\n`;
md += '| Configuration | k=20 P/R | k=40 P/R | k=80 P/R | Relevant/query, 20 → 80 | Words/query, 20 → 80 |\n|---|---|---|---|---|---|\n' + primaryRows + '\n\n';
md += 'The 400/80 and 800/150 settings specify maximum chunk words / overlap words. Chunks remain within pages, so doubling the maximum does not double the typical passage length.\n\n| Chunk setting | Corpus chunks | Mean body words | Median body words | Maximum body words |\n|---|---|---|---|---|\n';
for (const s of chunkSizes) md += `| ${s.partition === 'a2' ? '400/80' : '800/150'} | ${s.count} | ${s.meanWords.toFixed(1)} | ${s.medianWords} | ${s.maxWords} |\n`;
md += '\n';
md += `The strongest effect is not necessarily the largest recall percentage: inspect the number of new relevant chunks, new source pages and extra words as well. The following intervals resample 21 categories (2,000 paired bootstrap draws); they describe this exploratory sample, not annotation accuracy or a fresh-test population.\n\n`;
md += '| Configuration | Δ recall 20 → 80, pp [95% interval] | Δ precision 20 → 80, pp [95% interval] | Relevant fraction in added ranks 21–40 | Relevant fraction in added ranks 41–80 |\n|---|---|---|---|---|\n';
for (const c of result.configurations) {
  const a = curve(c.id, 20), b = curve(c.id, 40), d = curve(c.id, 80);
  md += `| ${c.label} | ${interval(d.deltaVs20.recall)} | ${interval(d.deltaVs20.precision)} | ${pct((b.summary.relevant - a.summary.relevant) / 20)} | ${pct((d.summary.relevant - b.summary.relevant) / 40)} |\n`;
}
md += '\n## Searching deeper before reranking\n\n';
md += 'Fresh Qwen3.5 9B pointwise scores are shared across nested candidate pools of 20, 40 and 80 from the 400-word header hybrid configuration. Ratings use 220 words per passage, batches of four, temperature zero, seed 20260909 and explicit 16K context. Missing or malformed ratings are retried rather than converted to zero.\n\n';
md += '| Candidates scored | Returned k | P@k | R@k | P@5 | nDCG@10 on returned list | Relevant/query | Words/query |\n|---|---|---|---|---|---|---|---|\n' + inferenceRows + '\n\n';
md += '| Candidate-depth comparison | Δ P@5, pp [95% interval] | Δ nDCG@10 at output 10, pp [95% interval] |\n|---|---|---|\n';
for (const d of rerankDeltas) md += `| ${d.baseline} → ${d.candidates} candidates | ${interval(d.p5)} | ${interval(d.ndcg)} |\n`;
md += '\n| Candidates reranked | Δ P@5 versus the same hybrid ranking without reranking, pp [95% interval] |\n|---|---|\n';
for (const d of rerankVsRetrieval) md += `| ${d.candidates} | ${interval(d.p5)} |\n`;
md += '\n| Ontology dimension | P@5, 20 candidates | P@5, 40 candidates | P@5, 80 candidates |\n|---|---|---|---|\n';
for (const [id, name] of names) md += `| ${name} | ${deepTop5.map(r => pct(r.byDimension.find(d => d.dimensionId === id).p5)).join(' | ')} |\n`;
md += '\nOutput-five nDCG@10 above is intentionally based on only the five returned items; compare candidate sizes at the same output k. Increasing candidate depth can improve or harm top-five quality because reranking changes membership. Increasing only output k on one fixed list cannot change P@5, or nDCG@10 once k is at least ten.\n\n';
md += '## Enlarging the RRF search legs\n\nThis comparison changes the depth of the dense/BM25 legs before fusion, while always returning 20. It is separate from the fixed-ranking output-depth curves.\n\n';
md += '| Configuration | Candidates per leg | P@5 | Δ P@5 from leg depth 20, pp [95% interval] | nDCG@10 | P@20 | R@20 |\n|---|---|---|---|---|---|---|\n';
for (const r of result.legDepths) md += `| ${r.config} | ${r.legDepth} | ${pct(r.summary.p5)} | ${r.legDepth === 20 ? '—' : interval(legDepthDeltas.find(d => d.config === r.config && d.legDepth === r.legDepth).p5)} | ${pct(r.summary.ndcg10)} | ${pct(r.summary.precision)} | ${pct(r.summary.recall)} |\n`;
md += '\n## Conformal recall control on the larger pools\n\nEach fold calibrates on 36 questions and evaluates six questions from three disjoint categories. The query-level loss is the fraction of relevant candidates dropped; there is no top-k cap after filtering. Thresholds vary by fold. This is candidate-pool recall control under exchangeability assumptions, not corpus recall or answer factuality certification.\n\n';
md += '| Candidate pool | Target recall loss | Thresholds selected | Observed candidate recall loss | Returned-set precision | Mean returned | Words/query |\n|---|---|---|---|---|---|---|\n' + conformalRows + '\n\n';
md += '## Every depth and ontology dimension\n\nDimension results are exploratory six-question samples. Recall denominators are fixed across depths and across the verified equivalent 400-word partitions.\n\n';
for (const c of result.configurations) {
  md += `### ${c.label}\n\n| k | P@k | R@k | Relevant/query | Unique relevant pages/query | Words/query |\n|---|---|---|---|---|---|\n`;
  for (const r of result.curves.filter(r => r.config === c.id)) md += `| ${r.k} | ${pct(r.summary.precision)} | ${pct(r.summary.recall)} | ${num(r.summary.relevant)} | ${num(r.summary.uniqueRelevantPages)} | ${Math.round(r.summary.words)} |\n`;
  md += '\n| Dimension | k=20 P/R | k=40 P/R | k=80 P/R | Relevant/query, 20 → 80 |\n|---|---|---|---|---|\n';
  for (const [id, name] of names) {
    const a = curve(c.id, 20).byDimension.find(d => d.dimensionId === id);
    const b = curve(c.id, 40).byDimension.find(d => d.dimensionId === id);
    const d = curve(c.id, 80).byDimension.find(d => d.dimensionId === id);
    md += `| ${name} | ${pct(a.precision)} / ${pct(a.recall)} | ${pct(b.precision)} / ${pct(b.recall)} | ${pct(d.precision)} / ${pct(d.recall)} | ${num(a.relevant)} → ${num(d.relevant)} |\n`;
  }
  md += '\n';
}
md += `## What these results do and do not mean\n\n`;
md += '- Recall uses a fixed union of previously pooled and newly retrieved chunk IDs. It does not count every relevant fact in the corpus. The denominator has expanded since earlier reports, so old and new recall percentages are not directly comparable.\n';
md += '- The 400-word plain/header indexes have identical chunk IDs and evidence bodies. A previous header parser left suffix text on nine chunks whose titles contain a closing bracket; this run recovers the verified original bodies before judging. Retrieval vectors are unchanged.\n';
md += '- Primary judgments and reranker scores are both Qwen-generated. Old labels used older context defaults; new labels use explicit 16K context. Same-model preference, disputed labels and reuse of these questions limit conclusions. No answer generation or human factuality evaluation ran.\n';
md += '- The application defaults to a **1,200-word generation context**. Returning 40 or 80 chunks alone will not expose all that evidence to generation. Deeper retrieval followed by selective reranking is the relevant comparison for that budget.\n';
md += '- All search legs were fetched once at depth 80 and sliced. Real ANN queries issued separately with different limits can return different rankings. RRF depth effects are evaluated explicitly above.\n';
md += '- Larger chunks also mean larger contexts and different relevance units. This run reuses 400/800-word indexes; it does not establish an optimal chunk size or re-test every embedder/reranker.\n\n';
md += `## Provenance and reproduction\n\n${result.newJudgments} new relevance judgments; ${result.freshRatings} fresh validated pointwise ratings; ${result.invalidResponses} invalid responses retried. Model digests, index information, question IDs, fixed denominators, per-query results and all fold thresholds are in depth-results.json. Content-bearing caches remain ignored by Git.\n\n`;
md += '| Stage | Recorded local seconds | Calls |\n|---|---|---|\n';
for (const t of result.timing) md += `| ${t.phase} | ${t.seconds.toFixed(1)} | ${t.calls} |\n`;
md += '\nTimes include recorded inference attempts and exclude some file I/O and orchestration. Scores are shared across candidate-depth conditions, so the experiment avoids paying for repeated identical ratings. Production latency at each candidate depth has not been benchmarked separately.\n\n';
md += '```powershell\nnode calibration/review/depth-metrics.test.mjs\nnode calibration/review/depth-run.mjs\nnode calibration/review/depth-report.mjs\n```\n\n';
md += 'The runner resumes completed local work from a fingerprinted cache. See [the pre-run plan](../../review/DEPTH-PLAN.md). No application defaults or vector indexes were changed.\n';
writeFileSync(OUT + 'depth-report.md', md);
writeFileSync(OUT + 'depth-comparisons.json', JSON.stringify({ rerankDeltas, rerankVsRetrieval, legDepthDeltas, chunkSizes }, null, 2));
console.log(OUT + 'depth-report.md');
