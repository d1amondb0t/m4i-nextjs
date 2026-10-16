# Retrieval benchmark handoff

## Status 2026-10-15 18:11 UTC: benchmark complete

The sections below "Earlier handoff" describe the 15:31 UTC state and are kept for history; their live-process and continuation steps are done.

- **Full-corpus runs finished.** BGE-M3 (Unicode) and Qwen3 Embedding 4B (folded) dense/hybrid/MMR × global/dimension are in `rankings.json`, giving 18 configurations with the six BM25 runs. All pooled candidates are judged (8,210 pairs), `--phase score` ran, and `calibration/results/retrieval-report/report.md` is regenerated with an Interpretation section from `interpretation.md`. No processes are running.
- **Best configuration:** `unicode|bge-m3:latest|hybrid|dimension`, NDCG@10 0.469, P@5 0.498, MRR 0.714. Hybrid fusion is the most reliable gain. Qwen 4B dense, which led the controlled pool, is statistically indistinguishable from BM25 on the full corpus. `scripts/benchmark_diagnostics.py` prints the paired bootstrap intervals.
- **Data-quality finding:** `social-96.pdf` (95 of 98 chunks) and `economic-49.pdf` (1,643 of 2,413 chunks) have broken font encodings that neither the PDF screen nor the app's OCR check caught. The user chose to keep them for this benchmark and replace them in the dataset as a separate follow-up. Garbled chunks are at most 0.1% of any top 20.
- **Embedding fix:** `embed()` in `scripts/benchmark_retrieval.py` now halves an input that exceeds the model context, because Ollama 0.32.5 rejects it even with `truncate`. Only five BGE-M3 inputs from `social-96` were truncated; Qwen 4B needed none.
- `scripts/write_benchmark_report.py` escapes `|` in table cells, adds Hit@10/MRR, a data-quality table, and a note that the two evaluation sets differ.
- Use `C:\Users\Goofy\miniconda3\python.exe`; the `python` on the Git Bash PATH is a system Python without `requests`.
- Still not done: `scripts/validate_judge.py` (optional), replacing the two PDFs, and any commit or PR.

## Earlier handoff (15:31 UTC)

This file is for an agent continuing the user's active request. Read it before launching another download, export, embedding, or judging process.

## User's requested scope and decisions

- Build at least 100 distinct documents in each of the seven existing impact dimensions. Reject any PDF that needs OCR, then continue downloading replacements. Keep the `build_dataset.py` naming/layout.
- Keep chunking at the application's default 200 words with 50 words overlap. Compare document processing, normalization, embeddings, and dense/sparse/hybrid/MMR retrieval. Exclude answer generation and reranking.
- Compare Precision, Recall, NDCG and other useful ranking metrics. The user explicitly approved **machine relevance judgments** because the previous pair CSVs have no yes/no labels. Report recall against the judged candidate pool, never as absolute corpus recall.
- The user approved a larger quantized Qwen embedder if the computer supports it. RTX 3080 10 GB and 64 GB system RAM were found. `qwen3-embedding:4b` Q4_K_M is installed and works, alongside `qwen3-embedding:0.6b`, `bge-m3:latest`, and `nomic-embed-text:latest`.
- No need to switch the coding agent's model; long-running local embedding and labeling are the bottleneck.

## Completed data and code

- `scripts/build_dataset.py` now runs `scripts/check_pdf_ocr.mjs` before accepting each PDF, records SHA-256 and screening version, quarantines rejected old PDFs, and resumes until 100 accepted PDFs per dimension. Screening failures/timeouts are rejected. The seven `dataset/{dimension}/raw` folders have exactly 100 PDFs each. The 700 hashes are distinct. Rejected links/reasons are in `dataset/{dimension}/rejected.json`; rejected files are outside `raw`.
- `app/server/rag/chunking/document-helper.ts` was fixed so a long identifier on an otherwise readable page and truly blank pages do not spuriously trigger OCR. Its test was expanded.
- `scripts/export_dataset_corpus.test.ts` exports the accepted PDFs with the real `DocumentChunker()` defaults, caching by source hash. `vitest.corpus.mts` runs it. The export passed: **700 PDFs, 246,243 chunks, zero OCR or quarantined documents**. Export cache is `calibration/results/screened-corpus/*.pdf.json`; manifest and verification are there too. `scripts/verify_dataset.py` passed; it checks dimensions, hashes, chunk IDs, and OCR status. Per-dimension chunks: political 16,946; economic 55,687; social 26,713; environmental 24,729; urban_transport 44,285; humanitarian_rights 24,764; education 53,119.
- `scripts/benchmark_retrieval.py` completed the 110-document controlled comparison: 8,047 default chunks; 84 ontology questions; 1,680 previously machine-labeled question/chunk pairs, with seven unanimous votes per pair. It tests raw/Unicode/folded text, five embedding profiles (including Qwen 0.6B instructed and plain), and dense/BM25/hybrid RRF/MMR. It writes 60 configuration rows to `calibration/results/retrieval-benchmark/summary.json`. Each method orders the **same 20 judged candidates per question**. These are pool ranking metrics, not whole-corpus precision/recall. Its whole-corpus known-label diagnostics are incomplete-label diagnostics and must not be presented as ordinary precision.
- Preliminary report and all 60 controlled rows exist at `calibration/results/retrieval-report/report.md` and `controlled_metrics.csv`. The report currently also includes the provisional six-row sparse-only full-corpus table. `scripts/write_benchmark_report.py` must be rerun after final scoring to replace that table.
- `scripts/benchmark_screened.py` implements checkpointed `sparse`, `retrieve`, `judge`, `score` phases on all 246,243 chunks and 84 questions. Six BM25 configurations (3 normalizations x global/category-restricted scope) are saved in `calibration/results/screened-benchmark/rankings.json`. Machine labels from Qwen3.5 9B Q4 are checkpointed in `judgments.json` after each batch. The judge only labels for evaluation and does not affect retrieval. Its top-20 pool denominator changes when new configurations are added, so score again only after all desired configurations are ranked and judged.
- A **provisional sparse-only score** was produced after all six sparse configurations were judged: 2,789 pooled labels. It is in `calibration/results/screened-benchmark/summary.json` and will be replaced after dense candidates are added and judged. Unicode BM25 globally scored P@5 0.374, P@20 0.351, pool R@20 0.656, NDCG@10 0.385. Unicode BM25 with category restriction scored P@5 0.367, P@20 0.336, pool R@20 0.618, NDCG@10 0.401. These are machine-judged pooled metrics, not absolute recall.
- `scripts/validate_judge.py` is an optional sanity check against the prior machine labels. It has not been run. Those are machine-to-machine comparisons, not human gold labels.
- README explains the workflow. `.gitignore` ignores generated pyc and benchmark outputs. The dataset/results are intentionally ignored by Git but remain on disk. No commit or PR has been made.

## Controlled result snapshot

Best NDCG@10 per embedding profile (all from the same 20-candidate judged pool; see CSV for every metric and configuration):

| Profile                                     | Normalization | Method |   P@5 | Pool R@5 | NDCG@10 |
| ------------------------------------------- | ------------- | ------ | ----: | -------: | ------: |
| Qwen3 embedding 4B instructed               | folded        | dense  | 0.521 |    0.399 |   0.645 |
| BGE-M3                                      | Unicode       | hybrid | 0.531 |    0.368 |   0.633 |
| Qwen3 embedding 0.6B instructed             | folded        | hybrid | 0.502 |    0.354 |   0.601 |
| Qwen3 embedding 0.6B plain                  | folded        | hybrid | 0.495 |    0.349 |   0.588 |
| Nomic Embed Text (official search prefixes) | folded        | hybrid | 0.502 |    0.353 |   0.582 |

Qwen 4B dense raw NDCG@10 is 0.626 and folded is 0.645; its P@5 is 0.536 raw versus 0.521 folded. Qwen 4B folded hybrid P@5 is 0.545, NDCG@10 is 0.630. The differences are exploratory and may not generalize beyond the earlier candidate pool.

## Live processes at handoff

One `exec_command` session was still running at the last check. Session IDs are transient and may not be accessible to a different chat; inspect the checkpoint files and running Python command lines before restarting.

1. **BGE-M3 full-corpus embeddings/retrieval** — session `81617`; launched with:

   `python scripts/benchmark_screened.py --phase retrieve --models bge-m3:latest --normalizations unicode --strategies dense hybrid mmr --scopes global dimension --batch-size 32`

   At 15:31 UTC its embedding state `calibration/results/screened-benchmark/embeddings-d439b8b03a2a58f0.json` had passed **47,000 / 246,243** completed. The adjacent `.npy` is a memmap and resumes automatically. Do not use it for scoring until complete. This phase writes six new configurations when embeddings and rankings finish. Re-run the same command if it stops; do not run a second copy concurrently.

2. **Sparse global + category-restricted pooled relevance judgment** — session `98334` completed successfully at 15:31 UTC; launched with:

   `python scripts/benchmark_screened.py --phase judge`

   It labeled every candidate in the six saved sparse configurations. It read a snapshot of `rankings.json` at startup, so it does **not** include the BGE-M3 rankings that will be written later. Re-run `--phase judge` after each retrieval run to label new candidates; prior labels are skipped. The GPU judge and BGE-M3 fit together in 10 GB VRAM. If the judge unexpectedly stays on CPU, `ollama ps` shows `PROCESSOR`; stop just the judge, run `ollama stop qwen3.5:9b-q4_K_M`, then restart `--phase judge` without `--judge-cpu`. The checkpoint preserves labels.

Use `ollama ps` and `python -c "import psutil; print([(p.pid,p.info['cmdline']) for p in psutil.process_iter(['cmdline']) if p.info['cmdline'] and 'benchmark_screened.py' in ' '.join(p.info['cmdline'])])"` to identify active runs if sessions are gone. Do not launch duplicate writers to `rankings.json` or `judgments.json`.

## Recommended continuation

1. Confirm the two processes above. Let BGE-M3 finish. If it stopped, rerun its exact command; embedding state resumes from the last completed batch. If the judge stopped, rerun `python scripts/benchmark_screened.py --phase judge` and let it finish.
2. After BGE rankings are saved, rerun `python scripts/benchmark_screened.py --phase judge` to label BGE candidates. The GPU judge is fast when `ollama ps` says `100% GPU`. Optional provisional `python scripts/benchmark_screened.py --phase score` can compare BM25 and BGE once all their candidates are labeled, but repeat scoring after additional configurations because pool recall denominators change.
3. Run Qwen 4B on the full screened corpus with the best controlled normalization, while holding the default chunking fixed:

   `python scripts/benchmark_screened.py --phase retrieve --models qwen3-embedding:4b --normalizations folded --strategies dense hybrid mmr --scopes global dimension --batch-size 16`

   This is compute intensive (246,243 x 2,560-dimensional vectors, roughly 2.5 GB cache). Disk had over 330 GB free. Embedding batches checkpoint automatically. A prior 400 response during one controlled Qwen batch was transient and replay succeeded; `embed()` now retries three times and prints the response body on persistent failure. Do not run another `retrieve` writer concurrently. If the Qwen model and judge compete for VRAM, finish retrieval first and then run judge.

4. Rerun `python scripts/benchmark_screened.py --phase judge` after Qwen rankings finish, then `python scripts/benchmark_screened.py --phase score`. It refuses to score any unjudged top-20 chunk. This will compare all saved 700-document configurations with P@5/P@20, pool recall@20, NDCG@10/@20, MAP@20, Hit@10, and MRR. Recall is relative to the union of machine-judged retrieved candidates; relevance outside that pool is unknown.
5. Run `python scripts/write_benchmark_report.py` to update the Markdown and both CSV tables. Open the report in Codex for review. Add any concise interpretation supported by the final numbers, including normalization and model/retrieval tradeoffs. Explicitly state that the controlled 110-document pool and the screened 700-document corpus are different evaluation sets.
6. Optionally run `python scripts/validate_judge.py` after the primary benchmark; it currently forces CPU and may need a change to use GPU. It compares 84 positive/negative pairs with earlier machine labels. If used, label its agreement as machine-to-machine only.
7. Final verification: `npx vitest run app/server/rag/chunking/document-helper.test.ts`; `npx tsc --noEmit`; targeted ESLint/Prettier; `git diff --check`; `git status --short`. The 700-PDF export and verification already passed. Avoid rerunning the full export without a reason. `scripts/__pycache__/build_dataset.cpython-313.pyc` is tracked in the original repo; a fresh `verify_dataset.py` import can modify it, so restore it from `HEAD` if it appears in the diff. Git index writes were denied by this sandbox, so prior restoration used `git show HEAD:<path>` and wrote those bytes directly.

## Evaluation boundaries and implementation notes

- No reranker is used in either benchmark. MMR is candidate diversity selection inside retrieval, not a cross-encoder. Hybrid uses reciprocal rank fusion of cosine and local Okapi BM25. The per-question dimension from `ontology.json` enables the category-restricted scope.
- Embedding instructions are defined in `PROFILES` in `scripts/benchmark_retrieval.py`: Qwen query instruction, Nomic's `search_document:` / `search_query:` prefixes, and plain BGE. The controlled grid also compares instructed and plain Qwen 0.6B.
- The fixed earlier pool contains exactly 20 judged candidate chunks per question, so its P@20 and R@20 are constant and must not be interpreted as whole-corpus retrieval quality. The full-corpus method's pool recall@20 is also not absolute recall.
- PDF screening is conservative about nonblank pages with no extractable text and known extraction corruption. The application export is the second gate; any OCR/quarantined document was replaced until all 700 passed. The screening version and SHA checks avoid silently accepting stale PDFs.
- Project `AGENTS.md` says this Next.js version has breaking changes; the relevant `node_modules/next/dist/docs/` guidance was read before code changes. Read it again if making new Next.js API changes.
