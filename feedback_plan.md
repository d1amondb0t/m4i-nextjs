# Plan: hosted feedback collection

**Goal:** host the app for two testers. They upload documents, then either ask their own questions (RAG) or run the fixed ontology. They accept or reject every generated answer and mark chunks as relevant, irrelevant or "should have been used". Everything is stored in SQLite and exported as CSV.

**Decisions already made**

- Runs on your PC. Docker Compose holds the app and Qdrant; Ollama stays on the host GPU.
- Public URL through Tailscale Funnel. No router ports.
- Sign-in is one access code per user, kept in a cookie. No passwords.
- Every user has their own Qdrant collection.
- The ontology is fixed (`ontology.json`). The testers' own questions go through RAG mode and are the signal for gaps in the ontology.
- Verdicts are binary: accepted or rejected. There is no "partially correct".
- SQLite on a Docker volume, using the built-in `node:sqlite`.
- The browser keeps only the current job ID and unsent comment drafts in `localStorage`. The server snapshot is the source of truth.

Do the steps in order. Each one leaves the app working.

---

## Step 0: Task 1 from `to_implement.md` (dropped chunks)

Needed first: testers can only mark "should have been used" on chunks they can see. Keep `droppedBelowCutoff` and `droppedOutsideTopK` per question, as described there. Do the same for RAG mode: keep the reranked candidates past `topK` (they already exist in `retrieveWithComparison`).

## Step 1: Database

- New `app/server/db/`: `database.ts` (opens `DATA_DIR/m4i.sqlite`, runs migrations at start-up), `migrations.ts`, `db-types.ts`.
- `DATA_DIR` defaults to `./data` locally and `/data` in Docker. Add `data/` to `.gitignore`.
- CI runs Node 20, and `node:sqlite` needs Node 22.5 or newer. Raise CI to Node 24 to match your machine.

Tables:

| Table           | Columns                                                                                                                                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`         | `id`, `name`, `access_code_hash`, `collection`, `is_admin`, `created_at`                                                                                                                                                                                                                  |
| `documents`     | `id` (document ID), `user_id`, `collection`, `file_name`, `source_hash`, `index_fingerprint`, `chunk_count`, `uploaded_at`                                                                                                                                                                |
| `jobs`          | `id`, `user_id`, `mode` (`rag` / `ontology`), `status` (`queued` / `running` / `done` / `failed`), `progress_done`, `progress_total`, `error`, `created_at`, `started_at`, `finished_at`                                                                                                  |
| `runs`          | `id`, `job_id`, `user_id`, `collection`, `mode`, `generation_model`, `reranking_model`, `embedding_model`, `settings_json` (top-K, cutoff, candidates), `prompt_hash`, `created_at`                                                                                                       |
| `run_documents` | `run_id`, `document_id`                                                                                                                                                                                                                                                                   |
| `run_items`     | `id`, `run_id`, `kind` (`rag_answer` / `ontology_match`), `question`, `dimension_id`, `category_id`, `answer` (RAG answer, or the match's reason), `explicitness`, `nearest_ontology_question`, `nearest_ontology_similarity`                                                             |
| `run_chunks`    | `id`, `run_id`, `run_item_id` (nullable), `question`, `chunk_id`, `document_id`, `source`, `page`, `chunk_number`, `text`, `quote`, `status` (`sent` / `below_cutoff` / `outside_top_k`), `retrieval_rank`, `reranked_rank`, `dense_score`, `sparse_score`, `rrf_score`, `reranker_score` |
| `feedback`      | `id`, `user_id`, `run_id`, `target_type` (`run_item` / `run_chunk`), `target_id`, `verdict`, `comment`, `created_at`, `updated_at`                                                                                                                                                        |

- `feedback` is unique on `(user_id, target_type, target_id)`, so clicking again changes the verdict instead of adding a row.
- Verdicts: `accepted` / `rejected` on run items; `relevant` / `irrelevant` on sent chunks; `should_have_been_used` on dropped chunks.
- There is no chunks table. Qdrant holds the chunks, and `run_chunks` stores the text that was shown.

## Step 2: Users and access codes

- `scripts/create-user.mjs <name> [--admin]` creates the user, sets the collection to `m4i_<name>`, and prints a random code once. Only the hash is stored.
- `POST /api/session` with `{ code }` sets an HTTP-only cookie holding a signed session (`SESSION_SECRET` in the environment).
- `proxy.ts` redirects to `/login` when there is no cookie. This is only a fast first check. Every route handler still loads the user through `requireUser(request)`, as the Next 16 docs recommend (Proxy is not an authorization layer).
- `/login` has one field for the code.
- Add a short notice on the upload screens: documents are used internally only and nobody else sees them.

## Step 3: Per-user collections

- `RagPipeline`, `HierarchyPipeline` and `CalibrationPipeline` already take the collection through `RagPipelineConfiguration.collection`. Routes pass `user.collection` in place of `QDRANT_COLLECTION`.
- `QDRANT_COLLECTION` stays as the default for your own scripts (`rag_test`).
- After chunking, insert one `documents` row per document. This is an upsert on `(collection, source_hash, index_fingerprint)`.

## Step 4: Background jobs

- `POST /api/jobs` takes the form data (documents, mode, plus a question or nothing). It saves the files under `DATA_DIR/uploads/<job id>/`, inserts a `queued` job, and returns `{ jobId }` straight away.
- `GET /api/jobs/[id]` returns the status and progress, and the `runId` once the job is done. A user can only read their own jobs.
- `app/server/jobs/job-worker.ts` is a single in-process worker that runs one job at a time across all users, so two runs never compete for VRAM. It starts on first import and picks up the oldest `queued` job.
- On start-up, mark `running` jobs as `failed` with "Server restarted" so the tester can resubmit.
- `HierarchyPipeline.run` takes an `onProgress(done, total)` callback. The total is the number of questions for retrieval plus the number of questions for analysis (84 + 84 with the current ontology). RAG mode reports 3 phases: index, retrieve, generate.
- The current `/api/rag` and `/api/hierarchy` routes stay as they are for your own use and the tests. The UI moves to `/api/jobs`.

## Step 5: Run snapshots

- When a job finishes, the worker writes `runs`, `run_documents`, `run_items` and `run_chunks` in one transaction, then deletes the uploaded files.
- Ontology mode creates one `run_item` per accepted match. Its `run_chunks` cover every chunk for that question: the ones sent, the ones below the cutoff and the ones outside the top 12. Evidence chunks carry their `quote`.
- Questions with no match still record their chunks, with `run_item_id` set to null. The tester can still mark any of them as "should have been used".
- For RAG mode, embed the question once more against the ontology questions (embeddings cached at start-up) and store the closest one and its cosine similarity.
- `GET /api/runs/[id]` returns the snapshot plus the user's current feedback. `GET /api/runs` lists the user's runs.

## Step 6: Feedback API

- `PUT /api/feedback` with `{ targetType, targetId, verdict, comment? }` upserts the row and checks that the target belongs to one of the user's runs.
- It also checks that the verdict is valid for the target: `accepted`/`rejected` for items, `relevant`/`irrelevant` for `sent` chunks, `should_have_been_used` for dropped chunks.
- `DELETE /api/feedback` with the same target clears a verdict.
- The UI saves on every click. Comments save when the box loses focus.

## Step 7: UI

- **Shared:** a `useJob` hook stores the job ID in `localStorage` (wrapped in `try`/`catch`), polls `GET /api/jobs/[id]` every 3 seconds, and loads the run when it is done. On reload it resumes from the stored job ID. Unsent comment drafts are kept in `localStorage` per target.
- **RAG page:** the answer has Accept / Reject buttons and a comment box. Under it, each source chunk shows its full text, scores and Relevant / Irrelevant buttons. A collapsed "Not sent to the model" section lists the dropped candidates with a "Should have been used" button.
- **Ontology page:** dimension → category → question.
  - Each question shows its matches: the reason, the explicit/implicit label, the quoted evidence and Accept / Reject with a comment.
  - Next comes "Sent to the model (n)": full chunk text that can be expanded, scores and Relevant / Irrelevant.
  - Last, the collapsed dropped sections with "Should have been used".
  - Show a counter at the top, e.g. "32 of 57 matches reviewed".
- **Runs page:** `/runs` lists past runs with their review progress, so a tester can come back later.

## Step 8: CSV export

- `GET /api/export/feedback.csv` returns one row per feedback item, joined with its run, item and chunk. Columns: user, run, mode, created at, question, dimension, category, item answer, chunk ID, document, page, chunk status, ranks, the four scores, models, settings, verdict, comment.
- `GET /api/export/questions.csv` returns every RAG question with its user, time, closest ontology question, similarity and answer verdict, including questions with no feedback.
- Both are admin only, and the RFC 4180 quoting gets its own helper and tests.

## Step 9: Docker

- In `next.config.ts`, set `output: "standalone"`.
- Multi-stage `Dockerfile` on `node:24-bookworm-slim`: `npm ci`, `next build`, then copy `.next/standalone`, `.next/static`, `public`, `prompts`, `ontology.json`. `@napi-rs/canvas` and the transformers reranker must install for Linux, so build inside the image instead of copying `node_modules` from Windows.
- `compose.yaml` services:
  - `app`:
    - `OLLAMA_HOST=http://host.docker.internal:11434` and `QDRANT_HOST=qdrant`.
    - Volumes for `/data` and the Hugging Face model cache.
    - `extra_hosts: host.docker.internal:host-gateway`.
    - `127.0.0.1:3000:3000`.
  - `qdrant`: bound to `127.0.0.1` only. Pin a version instead of `latest`.
- Check that the container can reach Ollama. If Ollama only listens on `127.0.0.1`, set `OLLAMA_HOST=0.0.0.0` for the Ollama service on Windows.

## Step 10: Tailscale Funnel

- Run `tailscale funnel --bg 3000`, and only expose the app. Qdrant and Ollama stay private.
- Send each tester their URL and access code separately.
- The PC must be on and Ollama running while they use it. Jobs queued while it is off wait until it is back.

---

## Later, not now

- Editable ontology for testers.
- Using the labels to fine-tune or calibrate the reranker. `should_have_been_used` and `irrelevant` become labelled pairs for `scripts/build_calibration_pairs.py`.
