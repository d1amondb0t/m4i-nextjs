# M4I RAG pipeline tester

This Next.js application runs the current RAG implementation end to end:

1. `DocumentChunker` extracts and chunks uploaded PDF, TXT, or Markdown files.
2. `OllamaEmbedder` creates dense embeddings.
3. `QdrantStore` creates the collection and upserts dense and BM25 vectors.
4. `Retriever` embeds the question and retrieves the top matching chunks.
5. `OllamaGenerator` generates an answer from the retrieved context.

`RagPipeline` in `app/server/rag/pipeline/rag-pipeline.ts` initializes and
coordinates these components. The browser submits the files and question to
`POST /api/rag`; Ollama and Qdrant remain server-side.

## Run the live pipeline

Prerequisites: Node.js, Docker, and Ollama. The Qdrant instance must support
server-side `qdrant/bm25` vectors (Qdrant 1.15.2 or newer).

```powershell
npm install
Copy-Item .env.example .env.local
docker compose up -d
ollama pull hf.co/CompendiumLabs/bge-base-en-v1.5-gguf
# ollama pull hf.co/bartowski/Llama-3.2-1B-Instruct-GGUF
# ollama pull qwen3.5:9b-q8_0
ollama pull qwen3.5:9b-q4_K_M
npm run dev
```

Open `http://localhost:3000`, select one or more implemented document types,
enter a question, and choose **Run RAG pipeline**. The page displays the answer,
the number of indexed chunks, and the retrieved context with similarity scores.

The defaults work with Ollama and Qdrant on the local machine. Edit `.env.local`
to use other models, ports, collection names, prompt files, or a Qdrant Cloud
cluster. If the embedding model changes its vector dimensions, use a new
`QDRANT_COLLECTION` name or recreate the existing test collection.

PDF pages with no readable text, error-only text, or conspicuously joined words
are retried with a local Tesseract executable (or the path in
`TESSERACT_PATH`). Install Tesseract on the server to enable OCR. Pages that
remain unreadable are quarantined: they produce no chunks, and the page numbers
are recorded in the other chunks' `metadata.quarantinedPages` with reasons in
`metadata.quarantineReasons`. An entirely
unreadable PDF is rejected. PDF chunks preserve headings, paragraphs, captions,
table rows, and references separately, with block type, section, document topic,
and extraction quality in their metadata. Repeated headers, footers, and
near-identical passages within a document are deduplicated. References and page
furniture remain indexed with `retrievalRole: "auxiliary"` for later retrieval
filtering.

CSV, DOCX, and XLSX pass the general upload policy but are hidden from this
tester until their chunking implementations are complete.

## Automated verification

```powershell
npm test
npm run lint
npm run build
```

The unit tests mock Ollama and Qdrant at the pipeline boundary, so they verify
stage order and data flow without requiring either service. Running the browser
flow is the integration test for the real local services and selected models.

Stop Qdrant when finished:

```powershell
docker compose down
```

The named Docker volume preserves the test collection between runs. Use
`docker compose down --volumes` only when you intentionally want to delete it.

## Hierarchy question matching

The `/hierarchy` route matches document evidence to the supplied framework’s
questions. Supply evidence documents plus a JSON ontology containing dimensions,
categories, and a non-empty `questions` array for each category.

The pipeline indexes the documents once, then visits every category and question.
For each question it:

1. Retrieves up to 12 chunks using the dimension, category, and question, keeping
   scores of at least `0.45`. Searches are restricted to the uploaded documents.
2. Asks Ollama for up to 20 distinct candidate passages relevant to the question, with
   a brief explanation and supporting quotes. Partial answers, proposed outcomes,
   indicators, and measurement criteria can qualify; a complete answer or an
   achieved intervention is not required. A question can return multiple candidates.
3. Checks each candidate's cited chunk and quote independently against retrieval,
   removing repeated citations within the same question. Short quotes and one-sentence
   explanations keep the response within the model's context budget.

Outcomes and indicators are supplied by the final measuring framework’s question
associations; this pipeline does not extract or generate them. Results return the
original questions, match classifications, explanations, and citations. Matches
are preserved independently in each category, including empty categories.
Diagnostics distinguish candidate count from matched-question count and report
retrieved, proposed, and retained counts for every question, including empty results.

There are no model-generated validation scores, acceptance thresholds, or
cross-category winner assignments. Retrieval still uses the limits in
`DEFAULT_HIERARCHY_CONFIGURATION`, including a 4,000-word context budget. Each
question makes one retrieval call and, when evidence is retrieved, one matching
model call. This does not change the standard `/api/rag` pipeline.

## Manual relevance calibration dataset

`scripts/build_calibration_pairs.py` reads `ontology.json` and the downloaded
`dataset/{dimension}/raw/*.pdf` files. In filename-number order, it submits ten
PDFs from one dimension per `POST /api/calibration` request, together with every
question in that dimension's ontology categories. The server chunks and embeds
that batch once, then returns up to 20 ranked chunks per question. Each search is
filtered to the submitted documents and chunk configuration. There is no answer
generation, relevance judgment, or reranking by default.

With the Node server, Ollama, and Qdrant running:

```sh
python3 -m pip install pandas requests
python3 scripts/build_calibration_pairs.py
```

The output is `calibration/pairs.csv`. Its `related` column is empty for a human
to fill with `yes` or `no`. The script refuses to overwrite an existing output,
so use `--output` for another run. Partial output is saved after every successful
document batch. Run `python3 scripts/build_calibration_pairs.py --help` for chunk
size, overlap, embedding model, retrieval strategy, and optional cross-encoder
reranking options. The API accepts these settings in the multipart
`configuration` JSON field and questions in the `questions` JSON array field.
Only dense and sparse retrieval and cross-encoder reranking are implemented.

## OCR-screened retrieval comparison

`python scripts/build_dataset.py` maintains 100 PDFs in each of the seven
`dataset/{dimension}/raw/` folders. It checks every page before accepting a
download. Files with an image-only or badly broken text layer go to
`dataset/{dimension}/rejected/`, with the reason in `rejected.json`; accepted
URLs, SHA-256 hashes, and screening versions remain in `links.json`. Blank
pages do not trigger OCR. Re-running resumes and replaces rejected files until
each dimension has 100 distinct, text-extractable PDFs.

The comparison uses the application's default 200-word chunks with 50 words of
overlap. The corpus export runs `DocumentChunker` on every accepted PDF and
checks its output for OCR or quarantined pages:

```powershell
npx vitest run --config vitest.corpus.mts
python scripts/verify_dataset.py
```

For a quicker controlled comparison, `python scripts/benchmark_retrieval.py`
uses the earlier 110-document default-chunk corpus and its 1,680 machine-labeled
question–chunk pairs. `calibration/results/retrieval-benchmark/summary.json`
separates ranking on that fully judged pool from whole-corpus results, where
most newly retrieved chunks have no label. Pool recall at 20 is trivially 1
because that pool has exactly 20 candidates per question; precision at 5 and
NDCG at 10 are the useful comparisons there.

For the full screened dataset, run the checkpointed stages in order:

```powershell
python scripts/benchmark_screened.py --phase sparse
python scripts/benchmark_screened.py --phase retrieve --models bge-m3:latest --normalizations unicode --strategies dense hybrid mmr --batch-size 32
python scripts/benchmark_screened.py --phase retrieve --models qwen3-embedding:4b --normalizations folded --strategies dense hybrid mmr --batch-size 16
python scripts/benchmark_screened.py --phase judge
python scripts/benchmark_screened.py --phase score
python scripts/benchmark_diagnostics.py
python scripts/write_benchmark_report.py
```

`benchmark_diagnostics.py` prints paired bootstrap intervals for NDCG@10
differences and checks how many retrieved chunks are garbled. The report
includes `calibration/results/retrieval-report/interpretation.md` when it
exists, and lists accepted PDFs whose text layer is garbled.
`question_pairs.csv` beside the report has one row per judged question–chunk
pair: the judge's label, the chunk text, and every configuration's rank for it.

The sparse stage ranks BM25 on raw, Unicode-cleaned, and folded text. The full
corpus then adds the two strongest embedders from the controlled comparison,
each with its best normalization there: BGE-M3 on Unicode text and quantized
Qwen3 Embedding 4B on folded text. Each uses dense, reciprocal-rank hybrid, and
MMR selection, both across the whole corpus and within the question's
dimension. Without arguments, `--phase retrieve` runs every embedder and
normalization in the controlled grid, which takes far longer. Run only one
retrieve stage at a time because each rewrites `rankings.json`. No answer
generation or cross-encoder reranking is part of retrieval. Run the judge after
every retrieve stage; it skips chunks that already have labels, and the GPU is
much faster than `--judge-cpu`. The judgment stage uses Qwen3.5 to label the union of every
configuration's top 20 passages per question. Precision and NDCG are measured
on those labeled results; recall is relative to the judged candidate pool,
because relevance outside the pool is unknown. The output and embedding caches
are under `calibration/results/screened-benchmark/`.

### Chunking variants

`DocumentChunker` packs consecutive blocks of one section into passages of up
to 200 words with whole-sentence overlap. `assembly: "page"` keeps passages
within a page; `assembly: "flow"` continues them across pages and records
`pageEnd`. To export the 700 PDFs with each assembly, compare them with the
earlier export, index one into its own Qdrant collection, and benchmark it:

```powershell
npx vitest run --config vitest.variants.mts
python scripts/compare_chunking.py
$env:VARIANT = "v4-flow"; npx vitest run --config vitest.index.mts
python scripts/benchmark_screened.py --phase sparse --normalizations unicode --source calibration/results/chunking-variants/v4-flow --output calibration/results/screened-benchmark-v4-flow
python scripts/benchmark_screened.py --phase retrieve --models bge-m3:latest --normalizations unicode --strategies dense hybrid --source calibration/results/chunking-variants/v4-flow --output calibration/results/screened-benchmark-v4-flow
python scripts/benchmark_screened.py --phase judge --source calibration/results/chunking-variants/v4-flow --output calibration/results/screened-benchmark-v4-flow
python scripts/benchmark_screened.py --phase score --source calibration/results/chunking-variants/v4-flow --output calibration/results/screened-benchmark-v4-flow
```

Variant folders are named after the chunker revision that produced them and
are kept for comparison; select which to export with `VARIANTS`. Scores now
include `relevant_share_of_retrieved_words`, so larger chunks cannot raise
precision just by holding more text. On Windows, fast embedders can exhaust
local ports through Ollama, so index one collection at a time.
[CHUNKING_RESULTS.md](CHUNKING_RESULTS.md) records the comparison.
