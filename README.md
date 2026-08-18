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
