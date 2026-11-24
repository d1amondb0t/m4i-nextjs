# Political indicator experiment

This experiment adds a step after the hierarchy matches. When a political category matches strongly, the step looks for outcome indicators and sorts them into short-term, medium-term and long-term outcomes. If the documents give none for a horizon, it answers the ontology's predefined indicators for that horizon, either from the context or by inference.

## Pieces

| File                                                             | Role                                                                                                                                                                               |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ontology-political-test.json` (repo root)                       | Temporary ontology: the political dimension of `ontology.json` plus an `outcomes` results chain per category (3 horizons × 3 indicators = 9 indicators per category, 27 in total). |
| `types/indicator-types.ts`                                       | Ontology, gate, configuration and result types.                                                                                                                                    |
| `app/server/rag/indicators/indicator-helper.ts`                  | Parses the ontology, gates categories on reranker score, assembles context and checks quotes against chunks.                                                                       |
| `app/server/rag/indicators/indicator-pipeline.ts`                | `IndicatorPipeline`: gate → rerank every indicator question → discover the document's own indicators → answer the predefined indicators for horizons that have none.               |
| `app/server/rag/indicators/ollama-indicator-analyzer*.ts`        | Ollama calls, JSON schemas and parsing.                                                                                                                                            |
| `prompts/indicator-discover.txt`, `prompts/indicator-answer.txt` | Production prompts. `experiments/political-indicators/prompts/` holds the variants.                                                                                                |

## Flow

1. **Gate.** A category triggers when at least `minimumMatches` of its accepted hierarchy matches cite a chunk with a reranker score of at least `minimumRerankerScore` (default 0.7). It can also require the match to be explicit.
2. **Indicator retrieval.** Each predefined indicator question of a triggered category is reranked on its own, the same way as the hierarchy questions. The relative zerank cutoff applies, and at most `chunksPerIndicator` chunks are kept per question.
3. **Discovery.** One call per category. The context is the chunks cited by the triggering matches plus the indicator chunks, interleaved across the horizons. The model lists the indicators the document reports or proposes, each with a horizon, a value and a verbatim quote. Indicators whose quote is not in the cited chunk are dropped.
4. **Fallback answers.** For each horizon with no grounded document indicator (or for every horizon when `fallback: "always"`), the predefined indicators are answered. This is one call per outcome by default, or one per indicator. Each answer has a basis:
   - `reported`: the answer is stated in the document. Needs a verbatim quote, otherwise it is downgraded to `inferred` and flagged `groundingFailed`.
   - `inferred`: the answer is reasoned from the context and the matched findings (for example "3 of 5" gives 60%, or "not measured yet").
   - `unknown`: nothing in the context relates to the indicator.

## Running

```bash
# 1. Index each document, run the political hierarchy, rerank all 27 indicator questions, then cache the results
npx vitest run -c vitest.indicators.mts experiments/political-indicators/prepare.test.ts

# 2. Replay the LLM stage for one or more variants (see variants.ts)
INDICATOR_VARIANTS=baseline,always npx vitest run -c vitest.indicators.mts experiments/political-indicators/analyze.test.ts

# 3. Score against answer-key.json
python experiments/political-indicators/score.py
```

`INDICATOR_CASES=a.txt,b.pdf` limits either stage to some documents. The PDFs come from `dataset/` and are not committed.

## Results (16 November 2026)

Six documents were used: three synthetic reports with a known answer (participatory budgeting, procurement transparency, and the rebuilt programme report), a hydrology note as a negative control, a World Bank development policy credit (`economic-1.pdf`) and a CRS explainer (`political-1.pdf`). Model: `qwen3.5:9b-q4_K_M`, thinking off, with zerank-2 reranking. The full table is in `results/summary.md`.

| Variant                                                             | Gate  | Document's own indicators found | Values right | Absent handled | Seconds (6 docs) |
| ------------------------------------------------------------------- | ----- | ------------------------------- | ------------ | -------------- | ---------------- |
| baseline (predefined only for horizons without document indicators) | 12/12 | 26/31                           | 6/6          | 17/18          | 213              |
| always (predefined on every horizon)                                | 12/12 | 26/31                           | 48/48        | 29/32          | 367              |
| always, no "unknown" basis                                          | 12/12 | 26/31                           | 48/48        | 30/32          | 384              |
| always, one call per indicator                                      | 12/12 | 26/31                           | 48/48        | 30/32          | 515              |
| always, strict inference prompt                                     | 10/10 | 21/26                           | 36/37        | 20/21          | 371              |
| always, 2 chunks per indicator                                      | 12/12 | 26/31                           | 48/48        | 29/32          | 384              |
| always, gemma3:12b                                                  | 12/12 | 23/31                           | 45/48        | 28/32          | 1,659            |
| discovery prompt with logframe examples                             | 12/12 | 25/31                           | 9/9          | 11/12          | 213              |

The strict variant is missing the programme report: an empty "reported" answer crashed the parser. The parser now turns an empty answer into a low-confidence "not reported".

- **The gate works at 0.7.** It triggers on every political case in the answer key and on nothing in the hydrology note. Borderline participation matches (0.58-0.65) stay below the threshold.
- **The quote check mattered most.** The first version dropped 21 of 51 discovered indicators, almost all of them real quotes. The model added a `Chunk` prefix to IDs, ended shortened quotes with a period, stitched sentences together, cited a neighbouring chunk, and wrote `'` where the PDF text has `�`. After the fix, 2 of 85 are dropped.
- **qwen3.5:9b beats gemma3:12b** on every measure, and gemma is 4.5 times slower. gemma also produced the only "reported" fabrications: "27 officials trained" counts civil society organisations, and health-council seats are given as elected office.
- **The prompt variants barely differ.** Banning "unknown" and asking one indicator at a time each handle one more absent case. One call per indicator costs 40% more time. The strict prompt returns more "unknown" answers without being more accurate. Two chunks per indicator change nothing.
- **Errors that remain in every variant:**
  - A share inferred without the counts to compute it. "100% of recommendations adopted" for the World Bank credit is the main case.
  - Scope confusion. Women's share in local health councils is reported as representation in elected office.

## Hierarchy quote check (side finding)

The hierarchy step checks quotes strictly and discards a candidate whose quote fails. Every political question was replayed through the production hierarchy analyzer on the cached contexts (`hierarchy-grounding.test.ts`, `results/hierarchy-grounding.json`):

| Check                                | Candidates kept  |
| ------------------------------------ | ---------------- |
| Production (`evidenceIsGrounded`)    | 159 of 245 (65%) |
| Indicator check (`groundedEvidence`) | 239 of 245 (98%) |

30 of the 80 recovered candidates quote a chunk other than the one they cite. The 6 still rejected are genuine misquotes.
