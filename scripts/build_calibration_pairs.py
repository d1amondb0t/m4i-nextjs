"""Build manual relevance-label pairs through POST /api/calibration.

Requires: pip install pandas requests
Start the Next.js API and its configured Ollama and Qdrant services first.
"""

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COLUMNS = [
    "dimension_id", "category_id", "batch_number", "question_number",
    "question", "rank", "document", "document_id", "chunk_id", "page",
    "chunk_number", "retrieval_score", "chunk_text", "related",
]


def document_order(path: Path):
    match = re.search(r"-(\d+)\.pdf$", path.name)
    return (int(match.group(1)) if match else float("inf"), path.name)


def build_pairs(args):
    import pandas as pd
    import requests

    if args.output.exists():
        raise FileExistsError(f"Output already exists: {args.output}. Choose a new --output to protect manual labels.")
    ontology = json.loads(args.ontology.read_text(encoding="utf-8"))
    rows = []
    configuration = {
        "chunkSize": args.chunk_size,
        "chunkOverlap": args.chunk_overlap,
        "retrieval": {"strategy": args.strategy, "topK": 20},
        "reranking": {"enabled": args.rerank, "model": args.reranking_model},
    }
    if args.embedding_model:
        configuration["embeddingModel"] = args.embedding_model

    for dimension in ontology["dimensions"]:
        dimension_id = dimension["id"]
        documents = sorted((args.dataset / dimension_id / "raw").glob("*.pdf"), key=document_order)
        if not documents:
            raise RuntimeError(f"No PDFs found for dimension {dimension_id}")
        question_refs = [
            (category["id"], number, question)
            for category in dimension["categories"]
            for number, question in enumerate(category["questions"], start=1)
        ]
        questions = [question for _, _, question in question_refs]
        for start in range(0, len(documents), 10):
            batch = documents[start : start + 10]
            batch_number = start // 10 + 1
            print(f"{dimension_id}: batch {batch_number}, {len(batch)} documents, {len(questions)} questions", flush=True)
            with requests.Session() as session:
                with_files = [("documents", (path.name, path.open("rb"), "application/pdf")) for path in batch]
                try:
                    response = session.post(
                        f"{args.api_url.rstrip('/')}/api/calibration",
                        files=with_files,
                        data={"questions": json.dumps(questions), "configuration": json.dumps(configuration)},
                        timeout=args.timeout,
                    )
                finally:
                    for _, (_, handle, _) in with_files:
                        handle.close()
            try:
                payload = response.json()
            except ValueError as error:
                raise RuntimeError(f"{dimension_id} batch {batch_number}: API returned non-JSON status {response.status_code}") from error
            if not response.ok or not payload.get("ok"):
                raise RuntimeError(f"{dimension_id} batch {batch_number}: {payload.get('message', response.status_code)}")
            results = payload["results"]
            if len(results) != len(question_refs):
                raise RuntimeError(f"{dimension_id} batch {batch_number}: API returned the wrong question count")
            for (category_id, question_number, question), result in zip(question_refs, results):
                if result["question"] != question:
                    raise RuntimeError(f"{dimension_id} batch {batch_number}: API changed question order")
                for match in result["matches"]:
                    if match["source"] not in {path.name for path in batch}:
                        raise RuntimeError(f"{dimension_id} batch {batch_number}: result escaped document batch")
                    rows.append({
                        "dimension_id": dimension_id,
                        "category_id": category_id,
                        "batch_number": batch_number,
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
                    })
            args.output.parent.mkdir(parents=True, exist_ok=True)
            temporary = args.output.with_suffix(args.output.suffix + ".tmp")
            pd.DataFrame(rows, columns=COLUMNS).to_csv(temporary, index=False)
            temporary.replace(args.output)
    print(f"Saved {len(rows)} question–chunk pairs to {args.output}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=ROOT / "dataset")
    parser.add_argument("--ontology", type=Path, default=ROOT / "ontology.json")
    parser.add_argument("--output", type=Path, default=ROOT / "calibration" / "pairs.csv")
    parser.add_argument("--api-url", default="http://localhost:3000")
    parser.add_argument("--chunk-size", type=int, default=200, help="Words per chunk")
    parser.add_argument("--chunk-overlap", type=int, default=50, help="Overlapping words")
    parser.add_argument("--embedding-model", help="Ollama model; server default if omitted")
    parser.add_argument("--strategy", choices=("dense", "sparse"), default="dense")
    parser.add_argument("--rerank", action="store_true", help="Enable cross-encoder reranking")
    parser.add_argument("--reranking-model", default="cross-encoder/ms-marco-MiniLM-L6-v2")
    parser.add_argument("--timeout", type=int, default=1800, help="Seconds per API batch")
    build_pairs(parser.parse_args())


if __name__ == "__main__":
    main()
