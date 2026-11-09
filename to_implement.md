# To implement: retrieval score follow-ups

Already done and committed: all four scores are displayed (`5755f72`) and normalized to a maximum of 1.00 (`db9b69e`).

Two tasks remain. They are independent and can be done in either order.

---

## Task 1: Show dropped chunks in the hierarchy diagnostics

**Goal:** show where chunks drop out for each question, so the top-12 limit and the 0.3 cutoff can be tuned from real runs.

**Where it runs:** on the server, during a hierarchy run. No new scoring is needed, because the reranker already scores every candidate. Today the dropped chunks are thrown away.

**Where it is visible:** Hierarchy page, in the "Retrieval and rejection diagnostics" panel at the bottom, after a run finishes.

### Target display

The numbers below are made up.

```
Did the ministry adopt the policy recommendations?
50 candidates → 12 top ranked → 9 above cutoff → 3 proposed → 2 retained

Sent to analyzer (9)
  report.pdf · page 4 · chunk 2     Dense 0.676  BM25 1.000  RRF 1.000  Rerank 0.957
  report.pdf · page 7 · chunk 9     Dense 0.630  BM25 0.600  RRF 0.984  Rerank 0.941
  ...
▸ Dropped: below the 0.300 cutoff (3)
    report.pdf · page 9 · chunk 14  Dense 0.447  BM25 —      RRF 0.484  Rerank 0.212
    ...
▸ Dropped: outside the top 12 (38)
    annex.pdf · page 2 · chunk 31   Dense 0.502  BM25 0.310  RRF 0.620  Rerank 0.198
    ...
```

### How to read it

Candidates are sorted by reranker score, so a chunk outside the top 12 can never outscore one inside it.

- **Cutoff may be too strict:** relevant passages appear under "below the cutoff".
- **Top 12 may be too small:** all 12 clear the cutoff, and chunks under "outside the top 12" also score 0.300 or higher. This cannot happen when any chunk is below the cutoff.

### Steps

1. **[retrieval.ts](app/server/rag/retrieval/retrieval.ts): expose the full ranked list.**
   - Move the body of `retrieve` into a new `rankCandidates(question, scope)` method that returns every candidate, without the `.slice(0, topK)`.
   - `retrieve` becomes `(await this.rankCandidates(question, scope)).slice(0, this.retrievalConfig.topK)`.

2. **[rag-pipeline-type.ts](types/rag-pipeline-type.ts): add a retriever type.**

   ```ts
   export type RankingRetriever = {
     rankCandidates(
       question: string,
       scope?: RetrievalScope,
     ): Promise<SearchResult[]>;
   };
   ```

   Leave `PipelineRetriever` as it is, because `RagPipeline` and `CalibrationPipeline` still use `retrieve`.

3. **[hierarchy-types.ts](types/hierarchy-types.ts): extend the types.**
   - Add to `QuestionRetrieval`: `droppedBelowCutoff: SearchResult[]` and `droppedOutsideTopK: SearchResult[]`.
   - Add to each entry of `HierarchyCategoryDiagnostics.questions`: `candidates: number`, `droppedBelowCutoff: HierarchyRetrievedChunk[]` and `droppedOutsideTopK: HierarchyRetrievedChunk[]`.
   - Keep `chunks` and `retrievedChunks` meaning "sent to the analyzer".

4. **[hierarchy-helper.ts](app/server/rag/hierarchy/hierarchy-helper.ts): add the split.**

   ```ts
   export function splitRankedCandidates(
     ranked: readonly SearchResult[],
     { topKPerQuery, minimumRetrievalScore }: HierarchyConfiguration,
   ) {
     const topRanked = ranked.slice(0, topKPerQuery);

     return {
       results: topRanked.filter((r) => r.score >= minimumRetrievalScore),
       droppedBelowCutoff: topRanked.filter(
         (r) => r.score < minimumRetrievalScore,
       ),
       droppedOutsideTopK: ranked.slice(topKPerQuery),
     };
   }
   ```

5. **[hierarchy-pipeline.ts](app/server/rag/hierarchy/hierarchy-pipeline.ts): use it.**
   - Change the `retriever` dependency and field type from `PipelineRetriever` to `RankingRetriever`.
   - In `retrieveOntology`, replace the `retrieve(...).filter(...)` call with `splitRankedCandidates(await this.retriever.rankCandidates(question, scope), this.configuration)`, and push `{ question, ...split }`.
   - In `analyzeCategory`, fill the new diagnostics fields. Use `hierarchyRetrievedChunk` for both dropped lists, and set `candidates` to the size of all three lists added together.
   - Only `results` may reach `this.analyzer.match`.

6. **[hierarchy-upload.tsx](app/components/hierarchy-upload.tsx): update the diagnostics panel.**
   - Replace the per-question summary with the funnel line: `candidates → top ranked → above cutoff → proposed → retained`. "Top ranked" is `chunks.length + droppedBelowCutoff.length`.
   - Label the existing chunk list "Sent to analyzer".
   - Add a collapsed `<details>` for each dropped list, each row using `RetrievalScoreList`.
   - Keep them collapsed: the current ontology has 84 questions, so this can reach 4,200 chunk rows, up from 1,008. Chunk text is not included, so each row stays small.

7. **Tests.**
   - [retrieval.test.ts](app/server/rag/retrieval/retrieval.test.ts): add a test that `rankCandidates` returns all candidates in reranked order. Change the `resolves.toBe(results)` assertions in the `retrieve` tests to `toEqual`, because `.slice` now returns a new array.
   - [hierarchy-helper.test.ts](app/server/rag/hierarchy/hierarchy-helper.test.ts): test `splitRankedCandidates` with a chunk in each group, including a score exactly at the cutoff (kept).
   - [hierarchy-pipeline.test.ts](app/server/rag/hierarchy/hierarchy-pipeline.test.ts): rename the `retrieve` mocks and assertions to `rankCandidates`. Add the new fields to the `diagnostics[0].questions` `toEqual`. Add a test that dropped chunks appear in diagnostics and never reach `analyzer.match`.

### Done when

- `npx tsc --noEmit`, `npm run lint`, `npm run format:check` and `npm test` all pass.
- A real hierarchy run shows the funnel, and for every question `candidates` equals analyzer + below cutoff + outside top 12.
- With zerank, `candidates` is up to 50. With the mxbai default it is up to 20.
- The matches returned are the same as before for the same documents, apart from normal model variation.

---

## Task 2: Add the four scores to the calibration CSV and Excel

**Goal:** new calibration runs record all four scores. This applies to future runs only; existing files stay as they are.

### Steps

1. **[build_calibration_pairs.py](scripts/build_calibration_pairs.py): add the columns.**
   - In `COLUMNS`, add these right after `"retrieval_score"`: `"dense_score"`, `"bm25_score"`, `"rrf_score"`, `"reranker_score"`.
   - Where each row is built, add:

     ```python
     "dense_score": match["scores"]["denseScore"],
     "bm25_score": match["scores"]["sparseScore"],
     "rrf_score": match["scores"]["rrfScore"],
     "reranker_score": match["scores"]["rerankerScore"],
     ```

   - Keep `retrieval_score` as `match["score"]`, the raw value used for ranking. It is not normalized, so it can differ from the new columns.

2. **[pairs_to_excel.py](scripts/pairs_to_excel.py): show the columns and keep them numeric.**
   - Add to `LAYOUT` after `retrieval_score`: `("dense_score", 9, False)`, `("bm25_score", 9, False)`, `("rrf_score", 9, False)`, `("reranker_score", 9, False)`.
   - Add a `SCORE_COLUMNS` tuple containing `retrieval_score` and the four new names.
   - Replace the single `score_column` with a list of positions, and apply the `"0.000"` format to each.
   - In `main`, convert each score column present in the file with `pd.to_numeric(frame[name], errors="coerce")`. The file is read with `keep_default_na=False`, so a column with any blank (such as `bm25_score`) otherwise loads as text and the number format has no effect.
   - In `write_workbook`, convert `NaN` to `None` before `sheet.append`, so blanks stay as empty cells.

3. **Decide which reranker the column should reflect.**
   - `--rerank` currently sends only `enabled` and `model`, so `reranker_score` would come from mxbai on the `transformers` runtime, not zerank-2.
   - To record zerank-2, add a `--reranking-runtime` argument, send it as `reranking.runtime`, and pass `--reranking-model zerank-2-score`.

### Expected behaviour

- **New `--output` file required:** the script rejects an existing CSV whose columns differ ("unexpected schema"), so old checkpoints cannot resume. They remain valid and untouched.
- **Blank cells are normal:** `reranker_score` is blank without `--rerank`. `dense_score` or `bm25_score` is blank when the chunk was not in that search's results. `rrf_score` is blank unless the strategy is hybrid.
- **Old CSVs still convert:** `pairs_to_excel.py` only uses columns present in the file.

### Done when

- A small run with a new `--output` produces the four columns, with `bm25_score` and `rrf_score` never above 1.
- `pairs_to_excel.py` creates a workbook where those columns are numbers shown to three decimals, with empty cells for blanks.
- `pairs_to_excel.py` still works on an existing old CSV.
