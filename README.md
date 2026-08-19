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
