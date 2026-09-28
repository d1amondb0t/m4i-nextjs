# M4I RAG pipeline tester

The [9 September RAG review](calibration/results/review/report.md) reproduces the
earlier retrieval metrics, identifies evaluation leakage, and reports new local
experiments. See [research and ontology guidance](docs/rag-research-review.md)
for the findings and limitations. Earlier adaptive-k results below are
exploratory, and adaptive selection is not yet connected to the application.

The [retrieval-depth follow-up](calibration/results/review/depth-report.md)
compares k=5–80 across five configurations, 400/800-word chunk settings, and
larger reranking/conformal pools on 42 questions. It includes per-dimension
results and fixed-denominator recall comparisons.

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

Scanned PDFs require OCR and are not supported by the current chunker. CSV,
DOCX, and XLSX pass the general upload policy but are hidden from this tester
until their chunking implementations are complete.

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

## Hierarchy extraction experiment

The `/hierarchy` route tests ontology-guided framework extraction without
changing the behavior of the standard `/api/rag` pipeline. Supply the same
document types plus a JSON ontology containing dimensions and leaf categories.
The page includes an editable example.

For every category the experiment:

1. Builds separate outcome and indicator queries from the dimension and
   category definitions, inclusion criteria, and exclusion criteria.
2. Retrieves up to 12 chunks per query and discards cosine scores below `0.45`.
   Searches are filtered to the documents uploaded in the current run, even
   when the Qdrant collection also contains earlier documents.
3. Merges duplicate chunks and asks Ollama for structured candidate evidence.
4. Rejects citations whose chunk IDs or verbatim quotes are absent from the
   retrieved context.
5. Independently scores category fit, type fit, evidence support, and
   specificity, applying the thresholds in
   `DEFAULT_HIERARCHY_CONFIGURATION`.
6. Consolidates exact equivalent candidates, assigning a cross-category
   duplicate to the category with the stronger category-fit score.

The result view keeps outcomes and indicators separate and shows retrieval
scores, validation scores, citations, and rejection reasons. Empty categories
are preserved as explicit abstentions.

These defaults are experimental rather than calibrated confidence
probabilities. Adjust the values in `types/hierarchy-types.ts` against a
labelled evaluation set before treating them as production thresholds. Each
leaf category currently makes two embedding queries, one extraction model call,
and one validation model call, so runtime grows linearly with category count.

## Retrieval calibration

The hierarchy thresholds shipped in `DEFAULT_HIERARCHY_CONFIGURATION` were
guesses. `calibration/` replaces them with values fitted to labelled retrieval
scores, and adds an adaptive `k` in place of a fixed top-5 cut.

### The ontology

`calibration/ontology.json` holds a seven-dimension impact ontology — political,
economic, social, environmental, urban & transport, humanitarian & rights, and
education — with 21 leaf categories and 84 questions. The dimensions mirror the
topical buckets of `docs/calibration-corpus-sources.md`, so each dimension has a
matching corpus.

Categories now carry an optional `questions` array stating what the category is
meant to answer. `buildCategoryQuery` appends them to the category's retrieval
query, and the calibration harness uses each one as a separate probe.

### Building the corpus

```bash
node calibration/download-corpus.mjs --per-topic 20
```

One source per dimension, all from the catalogue in `docs/`: EveryCRSReport
(politics), World Bank Documents & Reports (economy, environment), ROSA P
OAI-PMH (transport), ERIC (education), and OpenAlex open access (social,
humanitarian). ReliefWeb and SSOAR are listed in `docs/` but are not usable
without an approved `appname` and a working OAI endpoint respectively, so
OpenAlex substitutes for both.

PDFs land in `calibration/corpus/<topic>/` and are gitignored; the manifest is
tracked. Downloads are capped at three concurrent requests, carry a contact
`User-Agent`, and are deduplicated by content hash.

### Running the calibration

```bash
npm run calibrate
```

Requires live Ollama and Qdrant. It indexes every document through the real
`DocumentChunker` → `OllamaEmbedder` → `QdrantStore` path into a dedicated
`m4i_calibration` collection, retrieves and cross-encoder reranks a 20-candidate
pool per question, labels every candidate with an LLM relevance judge, and fits
the thresholds. Each stage caches its output in `calibration/results/`; delete a
stage's file to recompute it.

```bash
node calibration/report.mjs
```

renders `calibration/results/report.md` from the fitted values.

### What is fitted

Two thresholds, against two different error rates, because they guard against
two different mistakes:

- **`acceptThreshold`** — a chunk at or above it is used without further
  checking, so it is fitted to a target *false-accept* rate: the share of
  accepted chunks that are actually irrelevant. The fit takes the lowest
  threshold meeting the target, which admits the most evidence.
- **`rejectThreshold`** — a chunk below it is discarded, so it is fitted to a
  target *false-reject* rate: the share of genuinely relevant chunks lost. The
  fit takes the highest threshold meeting that target.

`adaptiveSelect` in `app/server/rag/retrieval/adaptive-k.ts` turns the two into
a Corrective-RAG style verdict and a per-question `k`:

- `accept` — something cleared `acceptThreshold`; `k` is how many did.
- `ambiguous` — nothing cleared it, but the top candidate is above
  `rejectThreshold`; `k` covers the candidates above `rejectThreshold`.
- `reject` — nothing cleared `rejectThreshold`; `k` is 0 and the caller should
  abstain rather than answer from noise.

In both non-rejecting cases `k` is trimmed by `relativeDropoff` — candidates
scoring below that fraction of the top score are dropped, so one strong match
does not drag in the mediocre tail behind it — then clamped to
`[minimumK, maximumK]`.

### Fitted results

The first calibration run found the pipeline's retrieval score barely
discriminative — reranker AUC 0.616, chunk precision stuck at 50–60% against a
39.2% base rate at *every* threshold. No threshold can fix a score with no
signal, so the next step was to find a better score.

## Retrieval experiment

```bash
npm run experiment
node calibration/experiment-report.mjs
```

82 configurations across five axes, scored against one shared pool of 16,364
relevance judgments. Full write-up in
`calibration/results/experiment/experiment-report.md`.

| Axis | Variants |
|---|---|
| Chunking | 200w/50, 400w/80, 800w/150, 400w + context header |
| Embedding | bge-base, bge-m3, nomic-embed-text, qwen3-embedding |
| Retrieval | dense, BM25, hybrid RRF |
| Reranker | none, ms-marco, bge-reranker-base, jina-turbo, mxbai, LLM listwise, LLM pointwise |
| Selection | fixed k, fitted adaptive k, split-conformal adaptive k |

Rerankers rescore an already-judged pool, so all 28 reranking runs cost no new
labels — TREC-style pooling is what makes the grid affordable.

### What the experiment found

- **The embedding model was the whole story.** Averaged over every other
  setting, `qwen3-embedding` reached 57.6% nDCG@10 against 48.0% for
  `bge-base-en-v1.5` — a bigger effect than reranking, fusion and chunking put
  together. These questions are long and analytical; an instruction-tuned
  encoder can represent what they ask for and a generic prefix cannot.
- **Cross-encoders rescue a weak pool and damage a strong one.** On the old
  bge-base pool, ms-marco gained +7.1pp nDCG@10. On the best pool it *lost*
  6.1pp, bge-reranker-base 8.2pp, jina-turbo 8.3pp. They substitute for
  retrieval quality rather than adding to it. Fix retrieval first.
- **Only the pointwise LLM rating produces a calibratable score.** Its precision
  rises monotonically — 60.2% at ≥0.1, 78.9% at ≥0.7, 82.0% at ≥0.9 — which is
  what a threshold needs and what the cross-encoder never had.
- **Hybrid RRF beat both legs** (54.9% vs 50.9% dense, 51.0% BM25). Qdrant was
  already storing the sparse vectors; `hybrid` just threw `not implemented`.
- **Chunking barely mattered** (2.1pp spread), and the context header did
  nothing. That axis is untested rather than refuted — a provenance prefix is
  not Anthropic's Contextual Retrieval.

### Operating point

On held-out questions, adaptive k beats fixed k = 5 on every axis at once:

| | precision | relevant/question | chunks/question |
|---|---|---|---|
| fixed k = 5 | 68.1% | 3.40 | 5.00 |
| adaptive k | **76.5%** | **3.83** | **4.98** |

Rejection catches **100% of out-of-scope questions** for 1.2% in-scope loss:
in-scope top scores bottom out at 0.5 with 87% at 0.9–1.0, while out-of-scope
questions never exceed 0.5.

Thresholds are on the pointwise LLM rating scale and are **not** transferable to
a cross-encoder score. Re-run `npm run experiment` after any change to the
embedding or reranker model.

### Judge reliability

Labels come from `qwen3.5:9b`. A `gemma3:12b` cross-check over 504 pairs gives
raw agreement 69.4% and **Cohen's kappa 0.381** — only "fair". Two consequences:
measured AUC understates true discrimination, and differences of one or two
points are inside label noise. The large effects above sit well outside it.
