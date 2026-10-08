"""Build manual relevance-label pairs through POST /api/calibration.

Requires: pip install pandas requests
Start the Next.js API and its configured Ollama and Qdrant services first.
"""

import argparse
import hashlib
import json
import re
import time
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COLUMNS = [
    "dimension_id",
    "category_id",
    "batch_number",
    "question_number",
    "question",
    "rank",
    "document",
    "document_id",
    "chunk_id",
    "page",
    "chunk_number",
    "retrieval_score",
    "chunk_text",
    "related",
]


@dataclass(frozen=True)
class BatchJob:
    index: int
    dimension_id: str
    batch_number: int
    documents: tuple[Path, ...]
    question_refs: tuple[tuple[str, int, str], ...]

    @property
    def key(self):
        return self.dimension_id, self.batch_number

    @property
    def label(self):
        return f"{self.dimension_id} batch {self.batch_number}"


def document_order(path: Path):
    match = re.search(r"-(\d+)\.pdf$", path.name)
    return (int(match.group(1)) if match else float("inf"), path.name)


def positive_integer(value: str):
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return parsed


def nonnegative_integer(value: str):
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("must be zero or a positive integer")
    return parsed


def positive_number(value: str):
    parsed = float(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be a positive number")
    return parsed


def build_jobs(args, ontology):
    jobs = []

    for dimension in ontology["dimensions"]:
        dimension_id = dimension["id"]
        documents = sorted(
            (args.dataset / dimension_id / "raw").glob("*.pdf"),
            key=document_order,
        )
        if not documents:
            raise RuntimeError(f"No PDFs found for dimension {dimension_id}")
        question_refs = tuple(
            (category["id"], number, question)
            for category in dimension["categories"]
            for number, question in enumerate(category["questions"], start=1)
        )

        for start in range(0, len(documents), 10):
            jobs.append(
                BatchJob(
                    index=len(jobs),
                    dimension_id=dimension_id,
                    batch_number=start // 10 + 1,
                    documents=tuple(documents[start : start + 10]),
                    question_refs=question_refs,
                )
            )

    return jobs


def build_signature(args, configuration, jobs):
    manifest = {
        "configuration": configuration,
        "ontology_sha256": hashlib.sha256(args.ontology.read_bytes()).hexdigest(),
        "documents": [
            {
                "path": path.relative_to(args.dataset).as_posix(),
                "size": path.stat().st_size,
                "modified_ns": path.stat().st_mtime_ns,
            }
            for job in jobs
            for path in job.documents
        ],
    }
    serialized = json.dumps(manifest, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def state_path_for(output: Path):
    return output.with_suffix(output.suffix + ".state.json")


def completed_prefix_count(jobs, rows_by_job):
    completed = 0
    for job in jobs:
        if job.key not in rows_by_job:
            break
        completed += 1
    return completed


def load_checkpoint(pd, args, jobs, signature):
    rows_by_job = {}
    state_path = state_path_for(args.output)

    if state_path.exists() and not args.output.exists():
        raise RuntimeError(
            f"Checkpoint state exists without its CSV: {state_path}. "
            "Restore the CSV or choose a new --output."
        )

    if args.output.exists():
        frame = pd.read_csv(args.output, keep_default_na=False)
        if list(frame.columns) != COLUMNS:
            raise RuntimeError(
                f"Existing output has an unexpected schema: {args.output}"
            )

        for row in frame.to_dict(orient="records"):
            key = str(row["dimension_id"]), int(row["batch_number"])
            rows_by_job.setdefault(key, []).append(row)

        existing_keys = list(rows_by_job)
        expected_keys = [job.key for job in jobs[: len(existing_keys)]]
        if existing_keys != expected_keys:
            raise RuntimeError(
                "Existing output is not a contiguous batch checkpoint. "
                "Preserve it and choose a new --output."
            )

        jobs_by_key = {job.key: job for job in jobs}
        for key, rows in rows_by_job.items():
            job = jobs_by_key.get(key)
            if job is None:
                raise RuntimeError(f"Existing output contains unknown batch {key}.")
            allowed_documents = {path.name for path in job.documents}
            if any(row["document"] not in allowed_documents for row in rows):
                raise RuntimeError(
                    f"Existing output contains a document outside {job.label}."
                )

    if state_path.exists():
        state = json.loads(state_path.read_text(encoding="utf-8"))
        if state.get("signature") != signature:
            raise RuntimeError(
                "The dataset, ontology, or pipeline configuration changed since "
                f"the checkpoint was created: {state_path}. Choose a new --output."
            )
    elif args.output.exists():
        print(
            f"Adopting legacy checkpoint {args.output}; assuming its configuration "
            "matches this run.",
            flush=True,
        )

    return rows_by_job, state_path


def write_state(state_path, signature, jobs, completed, status, error=None):
    state_path.parent.mkdir(parents=True, exist_ok=True)
    last_completed = jobs[completed - 1] if completed else None
    state = {
        "version": 1,
        "signature": signature,
        "status": status,
        "completed_batches": completed,
        "total_batches": len(jobs),
        "last_completed": (
            {
                "dimension_id": last_completed.dimension_id,
                "batch_number": last_completed.batch_number,
            }
            if last_completed
            else None
        ),
        "error": error,
    }
    temporary = state_path.with_suffix(state_path.suffix + ".tmp")
    temporary.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    temporary.replace(state_path)


def save_checkpoint(pd, args, jobs, rows_by_job, completed, state_path, signature):
    rows = [
        row for job in jobs[:completed] for row in rows_by_job.get(job.key, [])
    ]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    pd.DataFrame(rows, columns=COLUMNS).to_csv(temporary, index=False)
    temporary.replace(args.output)
    status = "complete" if completed == len(jobs) else "running"
    write_state(state_path, signature, jobs, completed, status)
    return len(rows)


def request_batch(requests, args, configuration, job):
    questions = [question for _, _, question in job.question_refs]
    allowed_documents = {path.name for path in job.documents}
    attempts = args.retries + 1

    for attempt in range(1, attempts + 1):
        print(
            f"{job.label}: attempt {attempt}/{attempts}, "
            f"{len(job.documents)} documents, {len(questions)} questions",
            flush=True,
        )
        response = None
        try:
            with requests.Session() as session:
                files = [
                    (
                        "documents",
                        (path.name, path.open("rb"), "application/pdf"),
                    )
                    for path in job.documents
                ]
                try:
                    response = session.post(
                        f"{args.api_url.rstrip('/')}/api/calibration",
                        files=files,
                        data={
                            "questions": json.dumps(questions),
                            "configuration": json.dumps(configuration),
                        },
                        timeout=args.timeout,
                    )
                finally:
                    for _, (_, handle, _) in files:
                        handle.close()
        except requests.RequestException as error:
            message = f"request failed: {error}"
            retryable = True
        else:
            try:
                payload = response.json()
            except ValueError:
                payload = None

            if isinstance(payload, dict) and response.ok and payload.get("ok"):
                break

            if isinstance(payload, dict):
                message = str(payload.get("message", response.status_code))
            else:
                message = f"API returned non-JSON status {response.status_code}"
            retryable = response.status_code >= 500

        if not retryable or attempt == attempts:
            raise RuntimeError(f"{job.label}: {message}")

        delay = args.retry_delay * (2 ** (attempt - 1))
        print(
            f"{job.label}: {message}; retrying in {delay:g} seconds",
            flush=True,
        )
        time.sleep(delay)

    results = payload.get("results")
    if not isinstance(results, list) or len(results) != len(job.question_refs):
        raise RuntimeError(f"{job.label}: API returned the wrong question count")

    batch_rows = []
    for (category_id, question_number, question), result in zip(
        job.question_refs, results
    ):
        if result.get("question") != question:
            raise RuntimeError(f"{job.label}: API changed question order")
        for match in result.get("matches", []):
            if match.get("source") not in allowed_documents:
                raise RuntimeError(f"{job.label}: result escaped document batch")
            batch_rows.append(
                {
                    "dimension_id": job.dimension_id,
                    "category_id": category_id,
                    "batch_number": job.batch_number,
                    "question_number": question_number,
                    "question": question,
                    "rank": match["rank"],
                    "document": match["source"],
                    "document_id": match["documentId"],
                    "chunk_id": match["chunkId"],
                    "page": match["page"],
                    "chunk_number": match["chunk"],
                    "retrieval_score": match["score"],
                    "chunk_text": match["text"],
                    "related": "",
                }
            )

    print(f"{job.label}: completed with {len(batch_rows)} pairs", flush=True)
    return batch_rows


def run_pending_jobs(
    pd,
    requests,
    args,
    configuration,
    jobs,
    rows_by_job,
    state_path,
    signature,
):
    next_commit = completed_prefix_count(jobs, rows_by_job)
    next_submit = next_commit
    completed_results = {}
    futures = {}
    failure = None
    executor = ThreadPoolExecutor(max_workers=args.workers)

    def submit_available():
        nonlocal next_submit
        while len(futures) < args.workers and next_submit < len(jobs):
            job = jobs[next_submit]
            future = executor.submit(
                request_batch, requests, args, configuration, job
            )
            futures[future] = next_submit
            next_submit += 1

    try:
        submit_available()
        while futures:
            done, _ = wait(futures, return_when=FIRST_COMPLETED)
            for future in done:
                index = futures.pop(future)
                try:
                    completed_results[index] = future.result()
                except Exception as error:
                    if failure is None or index < failure[0]:
                        failure = index, error

            failure_index = failure[0] if failure else len(jobs)
            while next_commit < failure_index and next_commit in completed_results:
                job = jobs[next_commit]
                rows_by_job[job.key] = completed_results.pop(next_commit)
                next_commit += 1
                row_count = save_checkpoint(
                    pd,
                    args,
                    jobs,
                    rows_by_job,
                    next_commit,
                    state_path,
                    signature,
                )
                print(
                    f"Checkpoint: {next_commit}/{len(jobs)} batches, "
                    f"{row_count} pairs",
                    flush=True,
                )

            if failure:
                for future in futures:
                    future.cancel()
                break

            submit_available()
    finally:
        executor.shutdown(wait=True, cancel_futures=True)

    if failure:
        _, error = failure
        raise error

    return next_commit


def build_pairs(args):
    import pandas as pd
    import requests

    ontology = json.loads(args.ontology.read_text(encoding="utf-8"))
    configuration = {
        "chunkSize": args.chunk_size,
        "chunkOverlap": args.chunk_overlap,
        "retrieval": {"strategy": args.strategy, "topK": 20},
        "reranking": {
            "enabled": args.rerank,
            "model": args.reranking_model,
        },
    }
    if args.embedding_model:
        configuration["embeddingModel"] = args.embedding_model

    jobs = build_jobs(args, ontology)
    signature = build_signature(args, configuration, jobs)
    rows_by_job, state_path = load_checkpoint(pd, args, jobs, signature)
    completed = completed_prefix_count(jobs, rows_by_job)

    if completed == len(jobs):
        write_state(state_path, signature, jobs, completed, "complete")
        print(f"Dataset is already complete: {args.output}")
        return

    print(
        f"Starting with {completed}/{len(jobs)} completed batches; "
        f"{args.workers} worker threads.",
        flush=True,
    )
    write_state(state_path, signature, jobs, completed, "running")

    try:
        completed = run_pending_jobs(
            pd,
            requests,
            args,
            configuration,
            jobs,
            rows_by_job,
            state_path,
            signature,
        )
    except BaseException as error:
        completed = completed_prefix_count(jobs, rows_by_job)
        write_state(
            state_path,
            signature,
            jobs,
            completed,
            "interrupted",
            str(error),
        )
        raise

    row_count = sum(len(rows_by_job[job.key]) for job in jobs)
    print(
        f"Saved {row_count} question–chunk pairs from {completed} batches "
        f"to {args.output}"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=ROOT / "dataset")
    parser.add_argument("--ontology", type=Path, default=ROOT / "ontology.json")
    parser.add_argument(
        "--output", type=Path, default=ROOT / "calibration" / "pairs.csv"
    )
    parser.add_argument("--api-url", default="http://localhost:3000")
    parser.add_argument(
        "--chunk-size", type=positive_integer, default=200, help="Words per chunk"
    )
    parser.add_argument(
        "--chunk-overlap",
        type=nonnegative_integer,
        default=50,
        help="Overlapping words",
    )
    parser.add_argument(
        "--embedding-model", help="Ollama model; server default if omitted"
    )
    parser.add_argument("--strategy", choices=("dense", "sparse"), default="dense")
    parser.add_argument(
        "--rerank", action="store_true", help="Enable cross-encoder reranking"
    )
    parser.add_argument(
        "--reranking-model", default="cross-encoder/ms-marco-MiniLM-L6-v2"
    )
    parser.add_argument(
        "--timeout",
        type=positive_integer,
        default=1800,
        help="Seconds per API batch",
    )
    parser.add_argument(
        "--workers",
        type=positive_integer,
        default=2,
        help="Concurrent API batch requests",
    )
    parser.add_argument(
        "--retries",
        type=nonnegative_integer,
        default=3,
        help="Retries after a transient batch failure",
    )
    parser.add_argument(
        "--retry-delay",
        type=positive_number,
        default=10,
        help="Initial retry delay in seconds; doubles after each failure",
    )
    build_pairs(parser.parse_args())


if __name__ == "__main__":
    main()
