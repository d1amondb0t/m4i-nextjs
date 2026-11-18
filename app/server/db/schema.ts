export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    access_code_hash TEXT NOT NULL UNIQUE,
    collection TEXT NOT NULL UNIQUE,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE documents (
    document_id TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    collection TEXT NOT NULL,
    file_name TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    index_fingerprint TEXT NOT NULL,
    chunk_count INTEGER NOT NULL,
    uploaded_at TEXT NOT NULL,
    PRIMARY KEY (collection, document_id, index_fingerprint)
  );

  CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    mode TEXT NOT NULL CHECK (mode IN ('rag', 'ontology')),
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
    question TEXT,
    uploads_json TEXT NOT NULL,
    progress_done INTEGER NOT NULL DEFAULT 0,
    progress_total INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    run_id TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT
  );
  CREATE INDEX jobs_status ON jobs (status, created_at);

  CREATE TABLE runs (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    collection TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('rag', 'ontology')),
    generation_model TEXT NOT NULL,
    reranking_model TEXT NOT NULL,
    embedding_model TEXT NOT NULL,
    settings_json TEXT NOT NULL,
    prompt_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX runs_user ON runs (user_id, created_at);

  CREATE TABLE run_documents (
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    PRIMARY KEY (run_id, document_id)
  );

  CREATE TABLE run_questions (
    id INTEGER PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    dimension_id TEXT,
    dimension_name TEXT,
    category_id TEXT,
    category_name TEXT,
    category_definition TEXT,
    question TEXT NOT NULL,
    nearest_ontology_question TEXT,
    nearest_ontology_similarity REAL
  );
  CREATE INDEX run_questions_run ON run_questions (run_id, position);

  CREATE TABLE run_items (
    id INTEGER PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    run_question_id INTEGER NOT NULL REFERENCES run_questions(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('rag_answer', 'ontology_match')),
    answer TEXT NOT NULL,
    explicitness TEXT CHECK (explicitness IN ('explicit', 'implicit'))
  );
  CREATE INDEX run_items_question ON run_items (run_question_id, position);

  CREATE TABLE run_chunks (
    id INTEGER PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    run_question_id INTEGER NOT NULL REFERENCES run_questions(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    chunk_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    source TEXT NOT NULL,
    page INTEGER NOT NULL,
    chunk_number INTEGER NOT NULL,
    text TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('sent', 'below_cutoff', 'outside_top_k')),
    retrieval_rank INTEGER,
    reranked_rank INTEGER,
    score REAL NOT NULL,
    dense_score REAL,
    sparse_score REAL,
    rrf_score REAL,
    reranker_score REAL,
    UNIQUE (run_question_id, chunk_id)
  );
  CREATE INDEX run_chunks_question ON run_chunks (run_question_id, position);

  CREATE TABLE run_evidence (
    run_item_id INTEGER NOT NULL REFERENCES run_items(id) ON DELETE CASCADE,
    run_chunk_id INTEGER NOT NULL REFERENCES run_chunks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    quote TEXT NOT NULL,
    PRIMARY KEY (run_item_id, position)
  );

  CREATE TABLE feedback (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('run_item', 'run_chunk')),
    target_id INTEGER NOT NULL,
    verdict TEXT NOT NULL CHECK (
      verdict IN ('accepted', 'rejected', 'relevant', 'irrelevant', 'should_have_been_used')
    ),
    comment TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, target_type, target_id)
  );
  CREATE INDEX feedback_run ON feedback (run_id);
  `,
  `
  ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
  `,
  `
  CREATE TABLE jobs_next (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    mode TEXT NOT NULL CHECK (mode IN ('rag', 'ontology', 'indicators')),
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
    question TEXT,
    uploads_json TEXT NOT NULL,
    stage TEXT,
    progress_done INTEGER NOT NULL DEFAULT 0,
    progress_total INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    run_id TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT
  );
  INSERT INTO jobs_next (id, user_id, mode, status, question, uploads_json,
    progress_done, progress_total, error, run_id, created_at, started_at, finished_at)
  SELECT id, user_id, mode, status, question, uploads_json,
    progress_done, progress_total, error, run_id, created_at, started_at, finished_at
  FROM jobs;
  DROP TABLE jobs;
  ALTER TABLE jobs_next RENAME TO jobs;
  CREATE INDEX jobs_status ON jobs (status, created_at);
  CREATE INDEX jobs_user ON jobs (user_id, created_at);

  CREATE TABLE runs_next (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    collection TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('rag', 'ontology', 'indicators')),
    generation_model TEXT NOT NULL,
    reranking_model TEXT NOT NULL,
    embedding_model TEXT NOT NULL,
    settings_json TEXT NOT NULL,
    prompt_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  INSERT INTO runs_next SELECT * FROM runs;
  DROP TABLE runs;
  ALTER TABLE runs_next RENAME TO runs;
  CREATE INDEX runs_user ON runs (user_id, created_at);

  CREATE TABLE run_items_next (
    id INTEGER PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    run_question_id INTEGER NOT NULL REFERENCES run_questions(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (
      kind IN ('rag_answer', 'ontology_match', 'document_indicator', 'indicator_answer')
    ),
    answer TEXT NOT NULL,
    explicitness TEXT CHECK (explicitness IN ('explicit', 'implicit')),
    indicator_json TEXT
  );
  INSERT INTO run_items_next (id, run_id, run_question_id, position, kind, answer, explicitness)
  SELECT id, run_id, run_question_id, position, kind, answer, explicitness FROM run_items;
  DROP TABLE run_items;
  ALTER TABLE run_items_next RENAME TO run_items;
  CREATE INDEX run_items_question ON run_items (run_question_id, position);

  ALTER TABLE run_questions ADD COLUMN horizon TEXT
    CHECK (horizon IN ('short_term', 'medium_term', 'long_term'));
  `,
];
