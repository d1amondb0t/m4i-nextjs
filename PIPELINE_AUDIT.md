# Document pipeline audit

2026-10-15, branch `feature/retrieval-benchmark`. Evidence comes from the 700-PDF screened corpus (246,243 chunks from the real `DocumentChunker`), the 8,210 machine-judged question–chunk pairs, a read-only scan of the live Qdrant collection, and five PDFs pushed through the app's real ingestion and hierarchy path into a separate `pipeline_audit` collection.

**Bottom line:** most nonsensical retrievals start before retrieval. Extraction and structuring turn PDFs into tiny line fragments, prefix them with false headings, and interleave columns. The retrievers then favour exactly those fragments. Downstream, the hierarchy pipeline's reranker threshold discards almost everything that is retrieved. Storage in Qdrant is faithful: what is stored is exactly what the chunker produced.

## Your example, traced

Row 1 of `question_pairs.csv` is `education-77.pdf`, page 5, the text `) .A` followed by `that it is",the teacher's job to 'bring About change, to cause'change and to`.

1. `education-77.pdf` is a scanned, double-spaced 1970s ERIC typescript with a poor embedded OCR layer ("teachihldarnthg", "a.;entof", "objectiyes"). The PDF screen accepts it because the text is extractable; nothing checks its quality.
2. Double spacing puts more than 20 pt between lines, so [`layoutPdfPages`](app/server/rag/chunking/document-helper.ts:121) inserts a blank line after every printed line. Every line becomes its own paragraph and chunk: 227 chunks from 7 pages, median 8 words.
3. The OCR fragment `) .A` passes [`isHeading`](app/server/rag/chunking/document-helper.ts:189): it has no lowercase letters and no closing punctuation, so it counts as an ALL-CAPS heading. [`chunkPages`](app/server/rag/chunking/chunk-documents.ts:172) then prepends it as the section to every chunk on pages 4–6.
4. The 14-word fragment shares "bring about … change" with the question. BM25 favours very short chunks, so three BM25 configurations and BGE-M3 hybrid all ranked it first. The judge correctly marked it irrelevant.

## Findings, ranked by impact

### 1. Chunks are line fragments, not 200-word passages (critical)

- The median chunk is **12 words**: 24% have 5 words or fewer, 71% have 25 or fewer, and only 2.9% reach 150 words. The 200-word size is a ceiling, not a target.
- [`chunkPages`](app/server/rag/chunking/chunk-documents.ts:148) emits one chunk per block and never merges blocks. Each heading, caption, page footer and line becomes a chunk on its own.
- The 50-word overlap almost never applies. It is used only in the [fallback for blocks without punctuation](app/server/rag/chunking/chunk-documents.ts:68). The benchmark report's "200 words with 50 words of overlap" describes the configuration, not the chunks that were actually produced.
- Paragraphs break at [every line ending in `.`, `!` or `?`](app/server/rag/chunking/document-helper.ts:307) and at every blank line. Double-spaced or loosely set pages therefore fragment line by line, up to 36.6 chunks per page (`social-76`).
- 25% of chunks start in lowercase (mid-sentence), and 60% end without terminal punctuation.
- **Effect on relevance:** the share of pairs judged relevant rises steadily with length, from 22% for 1–5 words to 30% (11–25), 39% (26–50), 48% (51–100) and 51% (151+). Of the 1,512 rank-1 results across all configurations, 880 (58%) were judged irrelevant, and 76% of those had 25 words or fewer.
- **Retrievers prefer fragments.** Chunks of 25 words or fewer are 71% of the corpus, but 83% of Qwen 4B dense top-5 results, 73% for BGE-M3 dense and 68% for BM25. Short texts embed close to almost any question.

### 2. Two-column pages are interleaved line by line (critical)

- [`layoutPdfPages`](app/server/rag/chunking/document-helper.ts:93) groups every text item at the same height across the full page width. On two-column pages, the left and right columns merge into one line separated by a tab.
- The structurer then [treats that tab as a table row](app/server/rag/chunking/document-helper.ts:293). Example from `environmental-72`: "Climate change can modify the suitability of particu - | History suggests that specialized economies".
- 20.5% of all chunks are `table` blocks, and at least 8,355 of the 50,524 table chunks are interleaved prose. Each one mixes half-sentences from two unrelated passages, which damages both the embeddings and keyword matching.

### 3. False headings are prepended to chunks (high)

- [`isHeading`](app/server/rag/chunking/document-helper.ts:189) accepts any line without lowercase letters, and any line that starts with a number and has no closing punctuation within the line.
- 47% of the 24,572 heading blocks contain no lowercase word. Examples include running headers with page numbers ("9 2 S H O C K W A V E S"), numbered paragraph lines ("49. The institutional setting for debt manage ment…"), IDs (`IN00571756`), scan stamps (`DUCEDEXACTLYASRECEIVED FROM`) and journal metadata (`CERIF: S112, S150`).
- [Every following chunk is prefixed with the section](app/server/rag/chunking/chunk-documents.ts:172) until the next heading. 17% of chunks carry a junk prefix, and section prefixes make up **16% of all indexed words**. Those words go into both the dense and the BM25 text.
- `documentTopic` comes from the first heading (for example "FOR OFFICIAL USE ONLY"). It is stored but used nowhere.

### 4. Retrieval in the app (high)

- **The hierarchy reranker threshold discards almost everything.** The app path uses dense retrieval and then the `ms-marco-MiniLM-L6-v2` cross-encoder, [converts its logits with a sigmoid](app/server/rag/retrieval/retrieval.ts:70), and [drops results below 0.45](types/hierarchy-types.ts:92). In the `pipeline_audit` run, 9 of the 10 probes kept **zero** chunks (top scores 0.000–0.085), so the analyzer never ran for those questions. Using the bare question instead of the composite query did not help. The model is English-only, trained on web search queries, and not calibrated for abstract "this work…" evaluation questions.
- **The composite query mixes signals.** [`buildCategoryQuery`](app/server/rag/hierarchy/hierarchy-helper.ts:157) embeds a 65–82-word query containing the dimension and category definitions and the include/exclude lists. Dense models do not understand "Exclude:", so excluded topics pull matching chunks closer.
- **BM25 length normalization is miscalibrated.** The app's Qdrant BM25 ([upsert](app/server/rag/storage/vector-storage.ts:62), [query](app/server/rag/storage/vector-storage.ts:167)) keeps Qdrant's default `avg_len` of 256 tokens, but the median chunk is 12 words. With `b = 0.75`, a 12-word chunk's term weights roughly triple, so fragments dominate sparse search. Six of the 227 `education-77` chunks have empty sparse vectors.
- **Auxiliary chunks are never filtered.** Headers, footers and references are tagged `retrievalRole: "auxiliary"`, but [`retrievalFilter`](app/server/rag/storage/storage-helper.ts:22) ignores the tag. Reference blocks are judged relevant only 9% of the time, and footers 14%.
- **References are rarely detected.** A references section is recognised only when its heading is exactly ["References" or "Bibliography"](app/server/rag/chunking/document-helper.ts:302). "ЛИТЕРАТУРА (REFERENCES)", numbered "7. References" and similar headings are missed, so 2.4% of chunks look like citations but are tagged as evidence.
- **The RAG route is unscoped.** [`RagPipeline.run`](app/server/rag/pipeline/rag-pipeline.ts:94) retrieves without a scope, searching the whole shared collection, including documents from earlier uploads. The hierarchy and calibration paths do pass a scope.
- **Hybrid retrieval is not implemented** ([retrieval.ts](app/server/rag/retrieval/retrieval.ts:114)), although it was the best method in the benchmark.
- **The default embedder is English-only.** It is `bge-base-en-v1.5` with a 512-token limit ([rag-pipeline-helper.ts](app/server/rag/pipeline/rag-pipeline-helper.ts:11)), as are the BM25 stemmer and the cross-encoder. Meanwhile, 48 corpus documents are not in English (25 French, 12 Spanish, 5 Cyrillic-script, 6 undetermined).

### 5. Text-level extraction defects (medium)

- **Words split by spaces:** in 5.2% of chunks (12,887), words are broken apart ("Developme nt", "T ransportation", "b etween"). The line builder [always inserts a space between pdf.js text items](app/server/rag/chunking/document-helper.ts:109), even when they belong to the same word. Separately, 2,992 chunks contain letter-spaced titles ("S H O C K W A V E S").
- **Hyphenation is never repaired:** affects 3.4% of chunks ("popu- lation"). [`cleanText`](app/server/rag/chunking/document-helper.ts:17) removes a hyphen only before a newline, but [`flushParagraph`](app/server/rag/chunking/document-helper.ts:266) has already joined the lines with spaces.
- **Header and footer detection only catches exact repeats.** [`repeatedEdges`](app/server/rag/chunking/document-helper.ts:214) needs an identical first or last line on at least two pages. Running headers with changing page numbers slip through and become headings (see finding 3) or paragraph text.
- **The text-quality check misses whole classes of bad text.** [`pageQualityReason`](app/server/rag/chunking/document-helper.ts:30) catches tokens of 36+ letters and replacement characters. It misses:
  - poor embedded OCR layers
  - joined words shorter than 36 letters ("Thereareseveralways")
  - glyph-code encodings (`social-96`, `economic-49`)
  - letter-spaced text

  5.4% of chunks have heavy OCR-style noise.

### 6. Dataset composition (medium; affects the benchmark more than the code)

- Folder dimension reflects source type rather than topic:
  - political: 99 of 100 are CRS reports
  - environmental: 47 procurement plans plus 21 World Bank implementation status reports
  - education: 42 scanned ERIC reports
  - social and humanitarian rights: mostly journal articles
- Procurement plans and status reports are mostly tables with little narrative that could answer impact questions. ERIC scans have the lowest relevance rate (19%), and project appraisal documents the highest (44%).
- Boilerplate repeats across documents: 1,884 texts appear in three or more documents, covering 12,473 chunks. Examples are CRS disclaimers and "planned actual planned actual…" table headers. Deduplication only runs within one document.

### 7. Index hygiene (medium)

- **The live collection is stale.** `rag_test_document_ocr`, the one set in `.env.local`, holds 241,295 points from 620 documents. For 567 of them the indexed version predates the current dataset file, and at least 80 current dataset files are not indexed at all. Nothing deletes or refreshes documents (`deleteDocument` is commented out in `vector-storage.ts`).
- **Orphaned chunks are possible.** Chunk IDs combine the document ID, page and block index with a fixed `structured-v1` tag ([chunk-documents.ts](app/server/rag/chunking/chunk-documents.ts:184)), and the index fingerprint uses a fixed `document-processing-v1` tag. If extraction changes for an unchanged PDF, old chunks beyond the new block count stay under the same document ID and fingerprint and remain retrievable. This was not observed in the live collection, but nothing prevents it.

### 8. Benchmark design caveats

- The ontology questions are written about "this work". The app asks them **per uploaded document**, but the benchmark asked them across 100–700 documents. That inflates topically similar but off-document hits, so the benchmark's absolute precision is pessimistic for the app's use case.
- The benchmark used bare questions, while the hierarchy path uses the composite query plus reranking and a threshold. The best benchmark configuration (hybrid) is not implemented in the app.
- Labels come from a single machine judge, and the "200/50 chunking" description is inaccurate (see finding 1).

## What works

- **Qdrant storage is faithful.** In the `pipeline_audit` run, every chunk was stored, the payload text equalled the chunk text in all 3,226 points, vectors had 768 dimensions, and sparse vectors were present except for six punctuation-only fragments.
- **Clean PDFs come through well.** Single-column, born-digital journal articles (for example `humanitarian_rights-40`) produce coherent paragraphs, and the best chunks there score sensibly (cross-encoder 0.52, dense 0.71).

## Suggested fix order

Fixes 1–3 and most of the extraction defects in finding 5 are implemented; [CHUNKING_RESULTS.md](CHUNKING_RESULTS.md) has the measurements.

1. **Merge blocks into real passages.** Build chunks by accumulating consecutive paragraph and table blocks within a section up to about 200 words, with sentence-aligned overlap. Drop or merge standalone headings, footers and page numbers instead of indexing them alone. Expected effect: the biggest single relevance gain (finding 1).
2. **Make layout column-aware.** Detect column gutters per page from item x-positions and read each column top to bottom before merging. Join pdf.js items without a space when the gap is smaller than about 0.15 × font size. Repair hyphenation when joining lines.
3. **Tighten heading detection and section handling.** Require some letters and words and a reasonable length. Reject numbered paragraphs, IDs, stamps and repeated running headers; detect running headers with variable page numbers by stripping digits. Keep the section label as metadata, or as one short title line, instead of prefixing unbounded junk.
4. **Fix retrieval defaults.**
   - Set BM25 `avg_len` to the real average, or switch to the local BM25 used by the benchmark.
   - Filter `retrievalRole = auxiliary` by default.
   - Calibrate or remove the 0.45 cross-encoder threshold. A multilingual or LLM-based reranker, or top-k without a threshold, would avoid discarding everything.
   - Scope `RagPipeline` retrieval to the uploaded documents.
   - Implement hybrid retrieval.
   - Use the bare question, or question plus category name, for the dense query, and keep definitions for the analyzer prompt.
5. **Strengthen text-quality gates.** Add a real-word or stopword-ratio check, glyph-encoding detection and letter-spacing repair. Route bad text layers to OCR or reject them.
6. **Clean up the index.** Add document deletion and re-indexing, put the extraction version into chunk IDs and fingerprints, and rebuild `rag_test_document_ocr` from the screened dataset.
7. **Rebalance the dataset.** Mix source types within each dimension and down-weight table-only documents. Optionally keep the benchmark per document to match the app.

## Reproduce

```bash
C:/Users/Goofy/miniconda3/python.exe scripts/audit_chunks.py
npx vitest run --config vitest.audit.mts
```

[`scripts/audit_chunks.py`](scripts/audit_chunks.py) writes `calibration/results/pipeline-audit/audit.json` and `rank1_irrelevant.csv`, which lists every irrelevant rank-1 chunk with its features. [`scripts/pipeline_audit.test.ts`](scripts/pipeline_audit.test.ts) recreates only the `pipeline_audit` collection (override it with `AUDIT_COLLECTION`) and writes `app_path.json`.
