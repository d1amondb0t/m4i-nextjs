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
