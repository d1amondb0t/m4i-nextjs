# Chunking fix results

2026-10-16, branch `feature/retrieval-benchmark`. This follows [PIPELINE_AUDIT.md](PIPELINE_AUDIT.md), finding 1. All 700 screened PDFs were exported with each chunker revision, and the chosen revision was benchmarked against the original chunks with the same questions, retrievers and judge.

**Recommendation: v4-flow.** It turns line fragments into real passages: the median chunk grows from 12 to 166 words, and only 0.4% of chunks have 25 words or fewer (v1: 71%). It also removes most of the text defects the audit found. On retrieval, BGE-M3 dense and hybrid improve significantly on every metric, including relevant words per retrieved word, which larger chunks cannot inflate.

## What each revision changes

| Revision | Change                                                                                                                                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1       | Original chunker: one chunk per extracted block                                                                                                                                                                                                                  |
| v2       | Packs consecutive blocks of one section into passages of up to 200 words with whole-sentence overlap; drops headers and footers; standalone headings become section labels; stricter heading detection; localised reference headings; hyphen repair across lines |
| v3       | v2, plus: numbered paragraphs and column-merged lines that layout marked as tables are read as prose; sections under 40 words merge forward; template codes (`IO_IND_TABLE`) are not headings                                                                    |
| v4       | v3, plus layout fixes: two-column bands are read one column at a time; pdf.js text pieces join without a space inside words; fake-bold duplicates are dropped; overlapping pieces and joins longer than 24 letters stay separate                                 |
| flat     | Reference only: a 200-word sliding window over each page's text, ignoring structure                                                                                                                                                                              |

Each structured revision has a `page` mode (passages stay within a page) and a `flow` mode (passages continue across pages, recording the end page).

## Chunk statistics, all 700 PDFs

Defect rates are per 1,000 words, so larger chunks are not penalised for containing more text.

| Metric                               |      v1 |   flat | v2-flow | v3-flow | **v4-flow** | v4-page |
| ------------------------------------ | ------: | -----: | ------: | ------: | ----------: | ------: |
| Chunks                               | 246,243 | 49,775 | 105,105 |  55,722 |  **53,824** |  57,200 |
| Median words                         |      12 |    200 |      30 |     168 |     **166** |     129 |
| Chunks ≤ 25 words                    |   70.8% |   1.0% |   47.3% |    0.5% |    **0.4%** |    3.8% |
| Chunks ≥ 150 words                   |    2.9% |  77.3% |   25.0% |   56.8% |   **55.3%** |   44.7% |
| Junk section label                   |   17.1% |     0% |    1.1% |    1.0% |    **1.1%** |    1.1% |
| Section-label share of indexed words |   16.3% |     0% |    5.4% |    2.8% |    **3.0%** |    3.3% |
| Starts mid-sentence (lowercase)      |   25.0% |  48.9% |   30.4% |   16.9% |   **15.1%** |   19.1% |
| Ends without terminal punctuation    |   60.5% |  90.6% |   62.3% |   38.6% |   **37.3%** |   41.9% |
| Interleaved two-column "tables"      |    3.4% |   8.1% |    7.5% |    1.0% |    **0.6%** |    0.5% |
| Hyphen splits per 1k words           |    2.01 |   0.93 |    0.61 |    1.07 |    **0.44** |    0.43 |
| Split words per 1k words             |    2.68 |   2.32 |    2.54 |    2.47 |    **0.10** |    0.10 |
| Joined words per 1k words            |    0.55 |   0.75 |    0.80 |    0.79 |    **0.94** |    0.94 |

Notes:

- **The chunk count falls 78%** (246,243 → 53,824), while indexed words fall only 9% (8.27M → 7.51M). The difference is page furniture that is no longer indexed, standalone headings, repeated section labels and fake-bold duplicates, minus the duplication that real overlap adds.
- **Text is kept.** Order-insensitive character coverage of v4-flow against v3-flow is a median 99.9%, and 21 documents fall below 95%. The lowest two are World Bank reports whose fake-bold duplicates v4 removes on purpose. A token-level comparison with v1 looks lower (97.5% median) only because fixing "Developme nt" removes the tokens "developme" and "nt".
- **Flow beats page.** Flow produces fewer fragments (0.4% vs 3.8% of chunks at 25 words or fewer) and longer passages. Page-level citations remain available: every chunk records its start page and, when it continues, its end page.
- **The one regression:** joined words rose slightly (0.55 → 0.94 per 1k words). A sample of the remaining cases shows three kinds:
  - real joins, concentrated in a few documents with tightly spaced text layers ("andlocalengineers" in `urban_transport-95`, "programsplay" in `economic-90`)
  - compounds whose hyphen glyph is missing from the PDF ("householdbased", "majorityowned")
  - real words the heuristic flags by mistake ("nonbeneficiaries", "disengagement")

## Retrieval, v1 chunks vs v4-flow chunks

Same 84 ontology questions, BGE-M3 on Unicode text, the same local BM25 and fusion, and the same judge (qwen3.5:9b-q4_K_M). v1 has 8,210 judged pairs and v4-flow has 5,405. "Relevant word share" is the fraction of retrieved words, up to the first 1,000, that come from chunks judged relevant; it does not reward larger chunks for holding more text.

| Configuration                  | P@5 v1 → v4       | NDCG@10 v1 → v4   | MRR v1 → v4       | Relevant word share v1 → v4 | Words in top 20 v1 → v4 |
| ------------------------------ | ----------------- | ----------------- | ----------------- | --------------------------- | ----------------------- |
| BM25                           | 0.374 → 0.440     | 0.355 → 0.462     | 0.556 → 0.667     | 0.409 → 0.463               | 719 → 3,368             |
| BM25 within dimension          | 0.367 → 0.445     | 0.372 → 0.446     | 0.578 → 0.647     | 0.405 → 0.449               | 929 → 3,401             |
| BGE-M3 dense                   | 0.390 → **0.562** | 0.395 → **0.553** | 0.604 → **0.759** | 0.485 → 0.568               | 937 → 3,252             |
| BGE-M3 dense within dimension  | 0.410 → 0.510     | 0.411 → 0.500     | 0.606 → 0.693     | 0.510 → 0.518               | 1,135 → 3,349           |
| BGE-M3 hybrid                  | 0.431 → **0.562** | 0.426 → 0.549     | 0.668 → 0.732     | 0.467 → **0.572**           | 785 → 3,341             |
| BGE-M3 hybrid within dimension | 0.498 → 0.517     | 0.469 → 0.504     | 0.714 → 0.723     | 0.494 → 0.514               | 1,065 → 3,379           |

Paired bootstrap over the 84 questions (v4-flow minus v1, 95% interval):

| Configuration                  | NDCG@10                 | P@5                     | Relevant word share     |
| ------------------------------ | ----------------------- | ----------------------- | ----------------------- |
| BM25                           | +0.107 [+0.050, +0.163] | +0.067 [−0.010, +0.143] | +0.054 [−0.002, +0.109] |
| BGE-M3 dense                   | +0.158 [+0.109, +0.205] | +0.171 [+0.112, +0.231] | +0.083 [+0.025, +0.141] |
| BGE-M3 hybrid                  | +0.123 [+0.072, +0.174] | +0.131 [+0.069, +0.190] | +0.105 [+0.046, +0.162] |
| BGE-M3 hybrid within dimension | +0.036 [−0.018, +0.091] | +0.019 [−0.045, +0.086] | +0.020 [−0.039, +0.082] |

- **The best configuration changes.** With v4-flow chunks, whole-corpus dense and hybrid (NDCG@10 0.553 and 0.549) beat the dimension-restricted variants. The best v4-flow configuration beats the best v1 configuration (hybrid within dimension) by +0.081 NDCG@10 [+0.025, +0.137].
- **The model now sees far more text.** The top 20 chunks carry about 3,300 words instead of 700–1,100.
- **Rank-1 hits are irrelevant less often:** 47% across these six configurations, down from 56%. The irrelevant top hits are now coherent passages on a related topic, not fragments. For "What policy or legislative change did this work seek to bring about, and was it adopted?", the BM25 top hit is an impact-assessment abstract about policy efforts to bring about change, and the hybrid top hit is a section on mainstreaming climate adaptation into ministry work plans. The remaining misses come from asking document-level questions across 700 documents without a reranker, not from broken chunks.

## Caveats

- The two benchmarks have different chunk sets, so their candidate pools and judged pairs differ. Pool recall is not comparable between them and is not reported here.
- All labels come from one machine judge. Larger chunks are more likely to contain some relevant sentence; the relevant-word-share metric controls for size, but not for how much of a long chunk is actually relevant.
- Remaining extraction defects:
  - narrow sidebar columns can still interleave
  - compounds whose hyphen glyph is missing join into one word, as do words in a few tightly spaced text layers
  - scanned documents with poor embedded OCR (for example `education-77`) keep their OCR errors
- The app's retrieval issues in the audit (the 0.45 reranker threshold, unfiltered auxiliary chunks, BM25 `avg_len`, unscoped RAG retrieval) are unchanged by this work.

## Vector database

v4-flow was indexed through the app's own `OllamaEmbedder` (default `bge-base-en-v1.5`, 768 dimensions) and `QdrantStore` into a separate collection, `rag_chunking_v4_flow`. Word counts below come from the stored payloads (`metadata.wordCount`, including any section label).

| Collection                                                                      | Documents |  Points | Points per document | Median words | Mean words | Points ≤ 25 words |
| ------------------------------------------------------------------------------- | --------: | ------: | ------------------: | -----------: | ---------: | ----------------: |
| `rag_test_document_ocr` (current `.env.local`; v1 chunker, older dataset files) |       620 | 241,295 |                 389 |           20 |       37.5 |             59.1% |
| `rag_chunking_v4_flow` (v4-flow, current 700 PDFs)                              |       700 |  53,824 |                  77 |          170 |      139.4 |              0.4% |

Every exported chunk was stored (53,824 points for 53,824 chunks). The two collections hold different document versions (see the audit), so the like-for-like chunk comparison is the export table above: 246,243 v1 chunks against 53,824 v4-flow chunks for the same 700 files.

**App path.** The same five audit PDFs, run through the app's ingestion and hierarchy retrieval into `pipeline_audit_v4` (flow assembly):

- **Chunk counts fall:** `education-77` 227 → 26, `environmental-72` 2,556 → 892, `political-74` 58 → 11, `economic-27` 194 → 41, `humanitarian_rights-40` 191 → 48.
- **Top dense hits are full passages** (42–203 words), and no chunk has an empty sparse vector (v1 had six in `education-77`).
- **The hierarchy reranker still discards almost everything.** As in the audit, 9 of 10 probes keep no chunk above the 0.45 threshold. That is the next fix.

**Operational note.** On Windows, Ollama opens one local connection per embedding input. With `bge-base` the indexer exhausted local ports twice (`TIME_WAIT`), surfacing as "insufficient buffer space" or `ECONNRESET`. `scripts/index_chunking_variant.test.ts` now paces requests, retries those errors and can resume with `RESUME=1`. The app's own `OllamaEmbedder` has no such handling, so bulk indexing through the app can fail the same way.
