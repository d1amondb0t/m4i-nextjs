# Hierarchy cutoff and extraction prompt review (12 November 2026)

This review traces every question of two overnight ontology runs on the hosted feedback app through the hierarchy pipeline. It records where evidence was lost, the experiments run on the stored contexts, and the changes merged into `feature/feedback-collection` as a result.

## The two runs

Both runs used `qwen3.5:9b-q4_K_M` (thinking off) with zerank-2 through Ollama, the top 12 chunks, a fixed 0.30 reranker cutoff, and a 4,000-word context. Each run covered 84 questions in 21 categories.

| Run   | Documents                                                              | Chunks | Result                    | Main cause                    |
| ----- | ---------------------------------------------------------------------- | ------ | ------------------------- | ----------------------------- |
| 03:11 | Four event-organiser web pages saved as PDF                            | 44     | 0 matches                 | The documents                 |
| 04:10 | A tourism wellbeing indicator framework, with indicators but no values | 24     | 39 matches on 5 questions | The 0.30 cutoff, then the LLM |

The app shows 168 steps per run because progress counts every question twice: once for retrieval and once for analysis.

### 03:11: web pages

30 of the 44 chunks are navigation, video lists, schedules, contact blocks and staff bios. The rest are mission statements with nothing measured. The ontology asks about measured change, so an empty result is mostly correct.

- At most 9 questions had a weak, implicit candidate, in 13 relevant (question, chunk) pairs. The best reranker score in the whole run was 0.366.
- The cutoff dropped 7 of those questions, and the LLM turned down the other 2.

### 04:10: indicator framework

31 questions have real evidence: an indicator that measures what the question asks about. This gives 51 relevant (question, chunk) pairs.

- 5 questions matched.
- The cutoff blocked all evidence for 18 questions. The reranker usually ranked the right chunk first but scored it between 0.23 and 0.29. Examples: hospital beds per capita at 0.27, housing affordability at 0.29, GHG emissions at 0.29, and the Climate Risk Index at 0.25.
- For 8 questions, the evidence reached the model and it returned `[]`. The clearest case is employment quality: the rank-1 chunk scored 0.52 and lists retention, vacancies and the wage gap.
- About 20 of the 39 matches hold up. The rest are filler from padding toward the 20-item limit.

### Each pipeline stage

1. **Document choice versus ontology scope.** This is the biggest factor. The ontology and the cutoff were calibrated on project and policy reports. In both runs, more than 60% of the questions have nothing to find.
2. **The 0.30 cutoff.** This is the largest loss where evidence exists. On the calibration set it kept 97% of relevant top-12 chunks. Here it kept 23 of 51 relevant pairs (45%). The median relevant score was 0.28.
3. **The LLM and its prompt.** The model answers all or nothing: either `[]` in under a second, or a list padded toward 20.
4. **Reranker ordering works.** For 31 of the 40 questions with evidence, a relevant chunk was at rank 1, and for 37 it was in the top 3. The absolute scores are low for these document types.
5. **The retriever was never involved.** The reranker takes 50 candidates, and these documents have only 44 and 24 chunks, so every chunk was reranked for every question.
6. **PDF extraction is a smaller factor.** A legend line was glued onto 15 of the 24 chunks. Two-column pages were interleaved line by line, which breaks verbatim quotes.

The answer key behind "relevant" is a manual reading of both documents against all 84 questions. It follows the analyzer prompt's rule that an indicator counts even without a reported result. A stricter key would move most of the 04:10 losses to "no evidence", but the cutoff and LLM findings on the "Which indicators…" questions hold either way.

## Experiments

Each question's stored context was replayed through local Ollama with the same prompt and ontology (both hash-checked), and the same schema and options. GPU runs are not bit-identical, so expect small differences.

### Model and cutoff ablations

| Experiment                    | Questions | Result                                                                                                                                             |
| ----------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replay as in production       | 25        | All 20 zero-match questions returned `[]` again, in 0.4–1 s each. The empty answers are the model's decision, not matches the quote check removed. |
| No cutoff (top 12 sent)       | 34        | 31 still returned `[]`. Lowering the cutoff alone recovers little with this model.                                                                 |
| `gemma3:12b`, same input      | 20        | Matches for 8 of the 20 zero-match questions. 9 quotes failed the verbatim check, mostly on an interleaved two-column chunk.                       |
| `qwen3.5:9b` with thinking on | 20        | 7 of 20 recovered, but with padding (one reason repeated 13 times), chunk IDs that don't exist, and misquotes.                                     |

With thinking off, the production setup matched 0 of these 20 questions.

### Contradictions in the extraction prompt

10 missed questions were run with thinking on so their reasoning could be read. These are the instructions in `prompts/hierarchy-extract.txt` and in the category payload that pull against each other:

- **Indicators versus "a shared word".** Rule 2 accepts an indicator or measurement method. Rule 6 says "a shared word alone is insufficient relevance". 6 of the 10 traces quote both rules against each other.
- **Results not required versus definitions built on change.** Rule 3 says proof of a change is not required. But 19 of the 21 category definitions start with "Changes in…", and several exclude lists demand outcomes, such as "without a health outcome".
- **Sector-level versus national-level scope.** Tourism GDP was rejected as "not general macro-fiscal policy".
- **"Up to 20".** All 10 traces quote the limit. When the model said yes, it padded toward 20.
- **Rule 7's empty answer.** `{"matches": []}` is the shortest valid answer, and without thinking the model takes it.
- **Sibling questions in the payload.** The category JSON listed all four questions, not only the one being asked.

### Prompt variants

These variants used `qwen3.5:9b` with thinking off on 28 questions where evidence was lost. The 18 questions lost at the cutoff were given their top 12 chunks without a cutoff. 12 no-evidence questions served as controls.

| Variant                                   | Recovered (of 28) | Grounded matches | On answer-key chunks |
| ----------------------------------------- | ----------------- | ---------------- | -------------------- |
| Production prompt                         | about 2           | —                | —                    |
| A. No include and exclude lists           | 2                 | 23               | 6                    |
| B. Rule 6 replaced with an indicator rule | 5                 | 53               | 31                   |
| C. Only the asked question in the payload | 5                 | 37               | 20                   |
| A + B + a limit of 8, strongest first     | 11                | 52               | 23                   |
| A + B + C                                 | 8                 | 62               | 28                   |
| **A + B + C + a limit of 8**              | **15**            | 80               | 44                   |

- **False positives:** all 12 controls returned `[]` under every variant.
- **Precision is mixed:** 44 of the 80 matches are on answer-key chunks. Several others are defensible, and a few are junk.
- **Each change alone recovers 2–5 questions.** All four together recover 15.
- **Still missed under every variant:** employment quality, trust between communities, participation indicators, GHG reduction, climate hazards and enrolment.
- **Re-run with the schema limit of 8:** after the merged branch set the schema's `maxItems` to 8, the run gave the same result: 15 of 28 recovered and 0 of 12 controls matched.

### Relative cutoff validation

`min(0.30, max(0.15, 0.6 × best score))` was compared with the fixed 0.30 on the manual calibration pairs:

| Data                                          | Fixed 0.30 | Relative cutoff |
| --------------------------------------------- | ---------- | --------------- |
| Calibration dev, relevant top-12 chunks kept  | 97.4%      | 97.4%           |
| Calibration test, relevant top-12 chunks kept | 97.7%      | 97.7%           |
| Run 04:10, relevant pairs kept                | 23 of 51   | 44 of 51        |

## Changes merged

All of these are on `feature/feedback-collection`.

- **`658a554`: relative cutoff and prompt fixes** (from `feature/analyzer-prompt-and-cutoff`)
  - zerank keeps chunks scoring at least 0.6 of the question's best score, with that cutoff kept between 0.15 and 0.30. The settings are `ZERANK_RETRIEVAL_CUTOFF` and `retrievalScoreCutoff`, and the pipeline rejects invalid values. The cutoff applies only to reranker scores. mxbai keeps its fixed 0.05.
  - Rule 4 now asks for up to 8 distinct passages, strongest first, with no repeated reasons. `MATCH_SCHEMA` uses `maxItems: 8`.
  - Rule 6's last sentence is replaced with the indicator rule: indicators, metrics and data sources count without values, even when the definition describes change.
  - The analyzer payload sends only the category's id, name and definition and the asked question, without sibling questions or include and exclude lists (`analyzerCategory`).
- **`34bfb04`: work that was already deployed**
  - Evidence quotes can expand to the full chunk with the quote highlighted.
  - The analyzer sends a 16,384-token context, fails with token counts when a reply stops at the limit, and invalid-JSON errors show how the reply ended.
  - The grounded RAG prompt was rewritten.
  - `.env.example` enables zerank.
- **`d0acc65`: the merge.** It keeps both analyzer changes, and the context-size comment now sizes the reply for 8 matches.
- **`e6f1802`: the diagnostics funnel.** Each question on the hierarchy page shows `candidates → top ranked → above the X cutoff → proposed → retained`, where X is the cutoff that question actually used. It lists the chunks sent to the analyzer, and in collapsed lists the chunks dropped below the cutoff or outside the top K. A local run showed 0.300 for questions whose best chunk scored about 0.9, and the 0.150 floor for a question whose best chunk scored 0.096.

## Not changed yet

1. Telling the model that a sector or regional instance of a concept counts (tourism GDP, tourism employment). Then compare qwen and gemma3:12b on the same stored contexts.
2. Adding to the ontology:
   - a "how is X measured" question for climate resilience, civic participation, and protection and rights
   - commitment or target questions for the social and governance dimensions
   - a home for culture, heritage and the visitor economy, if tourism documents are in scope
3. Removing repeated legend and header lines and de-interleaving two-column pages in the PDF extractor.
4. Telling testers to upload evaluation, project completion and policy reports. Websites and brochures will mostly come back empty, and correctly so.
5. Showing the cutoff value on the review page's "Below the reranker cutoff" heading. It needs the cutoff stored per run question.
