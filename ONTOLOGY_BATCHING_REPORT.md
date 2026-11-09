# Ontology layer: batching and speed experiment

Branch: `experiment/ontology-batching` · Date: 2026-11-09 · Status: **complete**

| Run | Documents | Status |
|---|---|---|
| Baseline | 10 | ✅ |
| Parallel | 8 | ✅ Both humanitarian_rights files skipped after a GPU failure |
| Baseline repeat | 2 | ✅ Noise check |
| Context-only | 2 | ✅ |
| Category batching | 3 | ✅ |

## Summary

1. **On stock Ollama settings, the pipeline crashes on the first real document.**
   - **What happens:** Ollama's default context is 4,096 tokens on GPUs under 24 GB. Analyzer prompts are 4.4–5.7k tokens, so Ollama keeps only the last 2,050 tokens, which drops the system prompt and the category. The answer then runs into the context limit and stops mid-JSON.
   - **Why it works for you:** your Ollama app sets `OLLAMA_CONTEXT_LENGTH=65536`.
   - **Side effect of 65,536:** at that size qwen3.5 doesn't fit in 10 GB, which slowed two documents badly.
   - **Fix:** the analyzer now sends `num_ctx` itself (12,288).
2. **Nothing was batched before. With the fixes, the same 8 documents run 22% faster** (4,781 s → 3,706 s).
   - **Reranking:** 13–26% faster on every document, from running 4 questions at once.
   - **Analysis:** most of its gain comes from the context fix (social-26 analysis: 855 → 389 s).
3. **The fixes don't change results beyond normal noise.**
   - **The baseline can't reproduce itself:** re-run with identical settings, reranker scores shift by up to 0.012, and only 53% of the baseline's (question, chunk) matches come back.
   - **The fixed versions drift no more than that:** parallel keeps 72% and context-only 47%.
4. **Your category batching idea (one LLM call per category) is not viable with qwen3.5 9B.**
   - **Fewer calls:** about 55% fewer analyzer calls and 25–45% fewer prompt tokens.
   - **But the model degenerates:** it often fills the 80-match limit with repeats or citations from the wrong question, or returns nothing.
   - **Net effect:** total time went from 18% faster to 65% slower depending on the document, and only 18% of baseline matches come back, far below the noise level.
5. **Parallelism can't give much more on this hardware.**
   - **qwen3.5 runs one request at a time:** Ollama loads it with a single slot regardless of settings.
   - **zerank is limited by compute:** 4 requests at once each run about 3.5× slower.
   - **Where to look instead:** the remaining time is in the amount of work, namely 38k reranker requests and writing analyzer output. See [next experiments](#what-would-actually-move-the-needle).
6. **GPU:** the RTX 3080 dropped off the system 3 times at its default 320 W limit. At 250 W it ran over an hour of benchmarks with no crash, a maximum of 73 °C, and no loss of speed.

**Recommendation:** keep P1 (context) and P2 (retrieval concurrency). Leave P3 (analysis concurrency) in; it's harmless. Don't adopt P4 (category batching).

## Setup

| Item | Value |
|---|---|
| Documents | 10, chosen at random with a fixed seed: political-26, -76, -97; economic-99, -60, -14; social-26, -40; humanitarian_rights-86, -28 |
| Category substitution | The dataset has no historical category; I used humanitarian_rights instead |
| Ontology | `ontology.json`: 7 dimensions, 21 categories, 84 questions |
| Models | zerank-2-score (Q8) for reranking, 50 candidates per question; qwen3.5:9b-q4_K_M for analysis; bge-base for embeddings |
| Isolation | A fresh Qdrant collection per document, because BM25's IDF depends on what else is in the collection |
| Harness | `scripts/benchmark_ontology_batching.test.ts` runs the real `HierarchyPipeline` and times every Ollama call by patching the client |
| Runner | `scripts/run_ontology_batching.sh` runs the variants in sequence, restarts Ollama with each variant's server settings, and aborts if the settings don't take effect |
| Comparison | `scripts/compare_ontology_batching.mjs` writes `comparison.json` |
| Raw output | `calibration/results/ontology-batching/`: one JSON per document per variant, plus Ollama logs and GPU telemetry |

### Run configurations

| Run | Ollama slots | Questions at once (retrieval / analysis) | Analyzer context | Analyzer |
|---|---|---|---|---|
| baseline | 1 | 1 / 1 | 65,536 (your app's setting) | One call per question |
| parallel | 4 | 4 / 4 | 12,288 | One call per question |
| baseline-repeat | 1 | 1 / 1 | 65,536 | One call per question |
| context-only | 1 | 1 / 1 | 12,288 | One call per question |
| category | 4 | 4 / 4 | 24,576 | One call per category |

## Baseline

| Document | Chunks | Total (s) | Rerank phase (s) | Analysis (s) | Analyzer calls | Matches kept |
|---|---:|---:|---:|---:|---:|---:|
| political-26 | 124 | 622 | 344 | 275 | 41 | 54 |
| political-76 | 9 | 120 | 77 | 42 | 12 | 3 |
| political-97 | 137 | 791 | 383 | 406 | 35 | 73 |
| economic-99 | 60 | 327 | 303 | 22 | 14 | 0 |
| economic-60 | 62 | 312 | 287 | 23 | 14 | 0 |
| economic-14 | 193 | 952 | 331 | 617 | 58 | 161 |
| social-26 | 538 | 1,288 | 422 | 855 | 47 | 83 |
| social-40 | 117 | 369 | 346 | 21 | 12 | 0 |
| humanitarian_rights-86 | 53 | 774 | 282 | 490 | 33 | 58 |
| humanitarian_rights-28 | 115 | 524 | 362 | 160 | 29 | 17 |
| **Total** | | **6,079 (101 min)** | **3,136** | **2,912** | **295** | **449** |

Questions whose chunks all fall below the 0.3 cutoff skip the analyzer, so there are 295 calls rather than 840. Chunking, indexing and query embedding together take under 1.5 minutes across all 10 documents.

### Where the time goes

| Phase | Time | Notes |
|---|---:|---|
| Rerank: GPU work | 27 min | 38,220 requests, about 264 tokens each, 42 ms of GPU time per request |
| Rerank: everything else | 25 min | About 40 ms per request spent on HTTP, scheduling and returning the top-20 logprobs |
| Analysis: writing the answer | 33 min | 140,545 output tokens at about 72 tokens/s |
| Analysis: reading the prompt | 12 min | 836k prompt tokens |
| Analysis: model loads | 3 min | About 19 s per document: zerank is unloaded and qwen3.5 loaded every time, because both don't fit in VRAM together |

### Wasted analyzer output

- **Candidates:** the analyzer proposed 946 matches; 449 were kept and 497 rejected.
  - **451 rejected as ungrounded:** the quote isn't verbatim in the cited chunk, or the chunk wasn't retrieved for that question.
  - **46 rejected as duplicates** of a passage already returned for the same question.
- **Cost:** each proposed match costs about 149 output tokens, so about half of the 33 minutes of output generation is thrown away.
- **Empty calls:** 155 of the 295 calls return `{"matches":[]}`. Those cost only prompt reading.

### Anomaly: social-26 and humanitarian_rights-86

- **The slowdown:** partway through these documents, prompt reading dropped from about 3,000 to about 250 tokens/s, and output generation from about 80 to 45–55 tokens/s.
- **What the log shows:** Ollama predicted that qwen3.5 at a 65,536-token context needs **13.2 GiB**. It still loaded every layer onto the 10 GB card with a 2 GB KV cache, so Windows probably overflowed into shared system memory.
- **Fix confirmed:** at 12,288 tokens, social-26 ran at 86 tokens/s and its analysis dropped from 855 to 389 s.

## Problems found and fixes tried

| # | Problem | Fix | Result |
|---|---|---|---|
| P1 | The analyzer sends no `num_ctx`. On stock Ollama, prompts are cut to 2,050 tokens and the run crashes. At 65,536 it can spill out of VRAM. | `analyzerContextTokens` (12,288) is sent as `num_ctx`. Peak prompt was 5.7k tokens and peak answer 3k. | **Keep.** No truncation; results within noise; the largest single speed gain. |
| P2 | Questions are retrieved and reranked strictly one after another. | `retrievalConcurrency` (4) runs 4 questions through retrieval and reranking at once. | **Keep.** 13–26% faster reranking. Needs `OLLAMA_NUM_PARALLEL=4` for the full effect. |
| P3 | Analyzer calls run strictly one after another. | `analysisConcurrency` (4), with questions from all categories in one queue. | **No gain:** Ollama runs qwen3.5 in 1 slot. Harmless. |
| P4 | One analyzer call per question (your batching idea). | `scripts/category-batched-analyzer.ts`: one call per category over the deduplicated chunks of its questions, with each match tagged by question number. | **Reject:** slower on 2 of 3 documents and much worse result agreement. See below. |
| P5 | A shared context prefix per category could reuse the prompt cache. | None. | **Not possible:** qwen3.5 is a hybrid/recurrent model, so llama.cpp has to re-read the prompt on every call. |
| P6 | Query embeddings are made one call per question. | None. | **Not worth it:** 52 s across 10 documents. |
| P7 | Flash attention. | None. | **Already on** (`flash_attn = auto`). |

### Code changes on the branch (not committed)

- [concurrency-helper.ts](app/server/rag/concurrency-helper.ts): `mapWithConcurrency`, which keeps results in input order.
- [hierarchy-pipeline.ts](app/server/rag/hierarchy/hierarchy-pipeline.ts):
  - Retrieval now runs as one flat list of question jobs with a concurrency limit.
  - Analysis is split into `matchCandidates` (the concurrent LLM calls) and a synchronous `analyzeCategory` (grounding, dedup, diagnostics).
  - Output order is unchanged.
- [ollama-hierarchy-analyzer.ts](app/server/rag/hierarchy/ollama-hierarchy-analyzer.ts): sends `num_ctx`.
- [hierarchy-types.ts](types/hierarchy-types.ts): three new settings: `retrievalConcurrency: 4`, `analysisConcurrency: 4`, `analyzerContextTokens: 12288`.
- Tests: an order-preservation test for the pipeline and tests for the helper. All 253 tests in `app/server/rag` pass and `tsc` is clean.
- The category analyzer exists only in `scripts/`; production code doesn't use it.

## How noisy is the pipeline? (baseline-repeat, context-only)

| Document | Run | Total (s) | Identical chunk lists | Max score change | Matches (base → run) | (question, chunk): shared / baseline only / run only |
|---|---|---|---:|---:|---|---|
| economic-99 | **repeat** | 327 → 321 | 81/84 | 0.012 | 0 → 0 | n/a |
| economic-99 | context-only | 327 → 325 | 81/84 | 0.012 | 0 → 0 | n/a |
| humanitarian_rights-28 | **repeat** | 524 → 511 | 74/84 | 0.010 | 17 → 11 | 8 / 7 / 3 |
| humanitarian_rights-28 | context-only | 524 → 546 | 71/84 | 0.010 | 17 → 13 | 7 / 8 / 6 |

**The baseline does not reproduce itself.**
- **Why:** each question sends its 50 reranker requests at once with `Promise.all`. They reach Ollama in a different order each run, and llama.cpp reuses cached prompt state from whichever request came just before. That shifts scores by about 0.01.
- **Effect:** chunks near the top-12 cutoff or the 0.3 score cutoff flip in or out, the analyzer sees a different context, and its greedy decoding diverges.
- **Context-only drifts exactly as much as the repeat does**, so the context change itself doesn't alter results.
- **Speed:** the context change doesn't speed up these small documents; it helps only where 65,536 was spilling out of VRAM.

Any before-and-after comparison of this pipeline will show about this much drift. Making reranking deterministic (see [next experiments](#what-would-actually-move-the-needle)) would make future comparisons much sharper.

## Parallel vs baseline (8 documents)

| Document | Total (s) | Rerank phase (s) | Analysis (s) | Identical chunk lists | Max score change | Matches (base → parallel) | (question, chunk): shared / baseline only / parallel only |
|---|---|---|---|---:|---:|---|---|
| economic-14 | 952 → 824 (−14%) | 331 → 281 | 617 → 539 | 55/84 | 0.010 | 161 → 182 | 90 / 28 / 50 |
| economic-60 | 312 → 266 (−15%) | 287 → 245 | 23 → 20 | 81/84 | 0.010 | 0 → 0 | n/a |
| economic-99 | 327 → 273 (−17%) | 303 → 251 | 22 → 20 | 79/84 | 0.012 | 0 → 0 | n/a |
| political-26 | 622 → 577 (−7%) | 344 → 315 | 275 → 259 | 61/84 | 0.017 | 54 → 61 | 30 / 8 / 12 |
| political-76 | 120 → 102 (−15%) | 77 → 58 | 42 → 43 | 82/84 | 0.011 | 3 → 3 | 3 / 0 / 0 |
| political-97 | 791 → 638 (−19%) | 383 → 322 | 406 → 313 | 62/84 | 0.013 | 73 → 68 | 34 / 24 / 17 |
| social-26 | 1,288 → 747 (−42%) | 422 → 347 | 855 → 389 | 59/84 | 0.012 | 83 → 70 | 37 / 14 / 9 |
| social-40 | 369 → 278 (−25%) | 346 → 257 | 21 → 19 | 78/84 | 0.015 | 0 → 0 | n/a |
| **Total** | **4,781 → 3,706 (−22%)** | **2,594 → 2,076 (−20%)** | **2,147 → 1,603 (−25%)** | **557/672** | | **374 → 384** | |

- **Speed:** faster on every document.
- **Results:** 72% of the baseline's (question, chunk) matches come back (194 of 268), with similar totals (374 → 384). An identical repeat kept only 53%, so this is within the noise.
- **By your rule:** the results aren't identical, but they differ only as much as two identical runs do, so the speed gain comes without a real change in results.

**Why it isn't much faster.** The amount of work doesn't change, and the GPU was already 90–100% busy:
- **Reranking still sends 4,200 zerank requests per document.** Throughput rose from about 12 to about 15 requests per second, but not 4×, because four batched requests each run about 3.5× slower.
- **Analysis is limited by writing output, and qwen3.5 runs in one slot.** A large document still needs 20–40k output tokens at about 90 tokens/s.

**Extra data point.** After a shutdown, a resumed run accidentally used the Ollama desktop app's server: 1 slot, client concurrency 4, context 12,288. political-97, economic-99 and economic-60 ran this way and came out 11% faster, with the same drift. They're kept in `app-server-concurrency/`. The runner now quits the app first.

## Category batching vs baseline (3 documents)

| Document | Total (s) | Analysis (s) | Analyzer calls | Prompt tokens | Output tokens | Matches (base → category) | (question, chunk): shared / baseline only / category only | Rejected |
|---|---|---|---|---|---|---|---|---|
| political-26 | 622 → 508 (−18%) | 275 → 204 | 41 → 18 | 124k → 93k | 17.7k → 13.6k | 54 → 25 | 8 / 30 / 8 | 59 → 59 |
| political-76 | 120 → 198 (+65%) | 42 → 140 | 12 → 7 | 23k → 13k | 1.8k → 11.2k | 3 → 7 | 0 / 3 / 5 | 8 → 73 |
| humanitarian_rights-28 | 524 → 632 (+21%) | 160 → 323 | 29 → 12 | 86k → 62k | 10.2k → 25.0k | 17 → 17 | 2 / 13 / 10 | 48 → 164 |

**What went wrong:**
- **It runs into the match limit.** 3 of the 37 category calls returned exactly 80 matches, the schema's maximum (20 per question × 4). That means the model looped, repeating passages until the limit. One political-76 call wrote 11,140 tokens and took 125 s; in the baseline, that whole document's analysis took 42 s.
- **It cites the wrong question.** In humanitarian_rights-28's legal_norms category, 76 of 80 returned matches cited a chunk retrieved for a different question. The grounding check rejects those, which drives rejections up from 48 to 164.
- **It finds less.** Most categories returned no matches at all. On political-26, matches dropped from 54 to 25, with only 8 shared.

**Conclusion:**
- **What it saves:** prompt tokens (−25 to −45%) and calls (−55%), as expected.
- **Why that doesn't help:** prompt reading was never the bottleneck. A 9B model given four questions at once writes more and worse output.
- **Result agreement:** only 10 of 56 baseline matches come back (18%), far below the 47–53% the noise runs show.
- **Verdict:** don't adopt this.

## GPU failures and the power limit

| # | When | Power limit | During | After |
|---|---|---|---|---|
| 1 | about 13:00 | 320 W | Parallel run | PC shut down |
| 2 | 13:42 | 320 W | Analysis of economic-14 | `CUDA error: unknown error`, then "GPU is lost" |
| 3 | 14:47 | 320 W | Analysis of humanitarian_rights-86 | `CUDA error: unknown error`, then "No devices were found" |
| none | 14:56–16:06 | **250 W** | Repeat, context-only and category runs | No errors |

**Telemetry** (every 15 s):

| Power limit | Samples | Average temperature | Maximum temperature | Average power | Maximum power | Thermal slowdown samples |
|---|---:|---:|---:|---:|---:|---:|
| 320 W, up to failure 3 | 226 | 74 °C | 81 °C | 271 W | 320 W | 66 |
| 250 W | 246 | 66 °C | 73 °C | 219 W | 251 W | n/a |

- **Speed at 250 W:** the repeat runs at 250 W were as fast as the 320 W baseline (321 vs 327 s, 511 vs 524 s), so the lower limit costs nothing for this workload.
- **Likely cause:** power-delivery or card instability near its maximum power.
- **Caveat:** `nvidia-smi -pl 250` resets on reboot. To make it stick, set it in MSI Afterburner, or re-run it at startup from an admin task.

## What would actually move the needle

These change results by design and need a quality check on the calibration split:
1. **Make reranking deterministic.**
   - **Option A:** send each question's 50 requests in a fixed order (concurrency 1 per question, while keeping several questions in flight).
   - **Option B:** use a reranker runtime that scores pairs as one batch.
   - **Why it matters:** this removes the noise floor above, which makes every future comparison meaningful.
2. **Cite sentence IDs instead of copying quotes.** Number the sentences in the context and have the model return IDs. This cuts output tokens, the largest analysis cost, and removes most of the 451 ungrounded rejections.
3. **Move zerank off one-HTTP-request-per-pair.** For example, a llama.cpp server with its rerank endpoint, or a batched transformers/ONNX run. This targets the 25 minutes of per-request overhead.
4. **Re-tune `ZERANK_RERANKING_CANDIDATES`.** 50 candidates × 84 questions sets the size of the rerank phase. Task 1 in `to_implement.md` (dropped-chunk diagnostics) shows how often candidates 13–50 are ever used.

## Gaps

- **Parallel run:** not run on humanitarian_rights-86 and -28; 8 of 10 documents are covered. `RESUME=parallel bash scripts/run_ontology_batching.sh` runs them.
- **Noise and category runs:** these used 2 and 3 documents, so their numbers are indicative, not precise.
- **Background load:** Overwatch was open, with about 2 GB of VRAM in use, during the category run. Ollama's snapshots show all models stayed fully on the GPU, so its timings should be affected little, if at all.
