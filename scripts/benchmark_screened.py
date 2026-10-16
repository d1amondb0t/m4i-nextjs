#!/usr/bin/env python3
"""Retrieve, machine-judge, and score the 700-document screened corpus.

Run --phase retrieve, then --phase judge, then --phase score. Every phase is
checkpointed. Judgments are pooled across all configurations, so recall means
recall against the judged pool, not absolute corpus recall.
"""

import argparse
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np
import requests

from benchmark_retrieval import (
    DEFAULT_MODELS, PROFILES, ROOT, bm25_scores, embed, mmr, normalize, order, rrf, unit,
)

SOURCE = ROOT / "calibration" / "results" / "screened-corpus"
OUTPUT = ROOT / "calibration" / "results" / "screened-benchmark"


def atomic_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def load_corpus(source=SOURCE):
    manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    if manifest["documents"] != 700 or manifest["failures"]:
        raise RuntimeError("The 700-document corpus export is incomplete or has OCR failures")
    files = sorted(source.glob("*.pdf.json"))
    if len(files) != 700:
        raise RuntimeError(f"Expected 700 exported PDFs, found {len(files)}")
    chunks = []
    digest = hashlib.sha256()
    for file in files:
        item = json.loads(file.read_text(encoding="utf-8"))
        digest.update(file.name.encode())
        digest.update(item["sourceHash"].encode())
        chunks.extend(item["chunks"])
    if any(c["metadata"].get("extractionQuality") == "ocr" or
           c["metadata"].get("quarantinedPages") for c in chunks):
        raise RuntimeError("OCR-dependent chunks found in screened corpus")
    return chunks, digest.hexdigest()


def load_questions():
    ontology = json.loads((ROOT / "ontology.json").read_text(encoding="utf-8"))
    return {
        f"{category['id']}#{number}": {"text": question, "dimension": dimension["id"]}
        for dimension in ontology["dimensions"]
        for category in dimension["categories"]
        for number, question in enumerate(category["questions"], 1)
    }


def retrieve(args):
    chunks, corpus_hash = load_corpus(args.source)
    questions = load_questions()
    keys = list(questions)
    by_dimension = {
        dimension: [i for i, chunk in enumerate(chunks)
                    if chunk["source"].startswith(f"{dimension}-")]
        for dimension in {question["dimension"] for question in questions.values()}
    }
    index = {"corpus_hash": corpus_hash, "chunk_ids": [c["chunkId"] for c in chunks],
             "questions": questions, "configurations": {}}
    index_path = args.output / "rankings.json"
    if index_path.exists():
        previous = json.loads(index_path.read_text(encoding="utf-8"))
        if previous["corpus_hash"] != corpus_hash:
            raise RuntimeError("Corpus changed; choose a new --output directory")
        index = previous
    with requests.Session() as client:
        for mode in args.normalizations:
            docs = [normalize(c["text"], mode) for c in chunks]
            queries = [normalize(questions[k]["text"], mode) for k in keys]
            sparse = bm25_scores(docs, queries)
            for scope in args.scopes:
                sparse_key = f"{mode}|bm25|sparse" + ("|dimension" if scope == "dimension" else "")
                if "sparse" in args.strategies and sparse_key not in index["configurations"]:
                    index["configurations"][sparse_key] = {
                        key: [chunks[i]["chunkId"] for i in order(
                            sparse[row], by_dimension[questions[key]["dimension"]]
                            if scope == "dimension" else None)[:20]]
                        for row, key in enumerate(keys)
                    }
                    atomic_json(index_path, index)
                    print(f"Saved {sparse_key}", flush=True)
            for profile in args.models:
                if profile not in PROFILES:
                    raise ValueError(f"Unknown model profile: {profile}")
                pending = [(strategy, scope) for strategy in args.strategies
                           if strategy != "sparse" for scope in args.scopes
                           if f"{mode}|{profile}|{strategy}" +
                           ("|dimension" if scope == "dimension" else "")
                           not in index["configurations"]]
                if not pending:
                    continue
                actual_model = profile.split("@")[0]
                doc_prefix, query_prefix = PROFILES[profile]
                doc_id = hashlib.sha256(f"{corpus_hash}|{actual_model}|{mode}|{doc_prefix}".encode()).hexdigest()[:16]
                query_id = hashlib.sha256(f"{actual_model}|{mode}|{query_prefix}".encode()).hexdigest()[:16]
                vectors = unit(embed(client, actual_model, [doc_prefix + d for d in docs],
                                     args.output / f"embeddings-{doc_id}.npy", args.batch_size))
                query_vectors = unit(embed(client, actual_model, [query_prefix + q for q in queries],
                                           args.output / f"queries-{query_id}.npy", args.batch_size))
                dense = query_vectors @ vectors.T
                ranked = {}
                for scope in {scope for _, scope in pending}:
                    for row, key in enumerate(keys):
                        scoped = by_dimension[questions[key]["dimension"]] if scope == "dimension" else None
                        ranked[(scope, row)] = (
                            order(dense[row], scoped)[:100],
                            order(sparse[row], scoped)[:100],
                        )
                for strategy, scope in pending:
                    rankings = {}
                    for row, key in enumerate(keys):
                        dense_top, sparse_top = ranked[(scope, row)]
                        if strategy == "dense":
                            selected = dense_top[:20]
                        elif strategy == "hybrid":
                            candidates = sorted(set(dense_top + sparse_top))
                            selected = rrf(dense[row], sparse[row], candidates, cutoff=100)[:20]
                        elif strategy == "mmr":
                            selected = mmr(dense[row], vectors, dense_top)
                        else:
                            raise ValueError(strategy)
                        rankings[key] = [chunks[i]["chunkId"] for i in selected]
                    name = f"{mode}|{profile}|{strategy}" + ("|dimension" if scope == "dimension" else "")
                    index["configurations"][name] = rankings
                    atomic_json(index_path, index)
                    print(f"Saved {name}", flush=True)


def judge_batch(client, model, question, passages, cpu=False):
    numbered = "\n\n".join(f"[{i}] {text[:2600]}" for i, text in enumerate(passages))
    prompt = (
        "Decide whether each passage contains substantive evidence relevant to answering the question. "
        "A partial answer, a concrete outcome, an indicator, or a directly relevant policy or method counts. "
        "A mere shared keyword, generic background, citation, or unrelated context does not. "
        "Return one boolean per passage in order.\n\n"
        f"Question: {question}\n\nPassages:\n{numbered}"
    )
    schema = {"type": "object", "properties": {"relevant": {
        "type": "array", "items": {"type": "boolean"},
        "minItems": len(passages), "maxItems": len(passages),
    }}, "required": ["relevant"]}
    response = client.post("http://127.0.0.1:11434/api/chat", json={
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "format": schema,
        "stream": False,
        "think": False,
        "options": {"temperature": 0, "num_predict": 300,
                    **({"num_gpu": 0} if cpu else {})},
    }, timeout=900)
    response.raise_for_status()
    content = json.loads(response.json()["message"]["content"])
    values = content["relevant"]
    if len(values) != len(passages) or any(type(v) is not bool for v in values):
        raise ValueError("Judge returned wrong number or type of relevance labels")
    return values


def judge(args):
    index = json.loads((args.output / "rankings.json").read_text(encoding="utf-8"))
    chunks, corpus_hash = load_corpus(args.source)
    if index["corpus_hash"] != corpus_hash:
        raise RuntimeError("Rankings do not match the corpus")
    text_by_id = {c["chunkId"]: c["text"] for c in chunks}
    pool = defaultdict(set)
    for rankings in index["configurations"].values():
        for question, ids in rankings.items():
            pool[question].update(ids)
    labels_path = args.output / "judgments.json"
    labels = json.loads(labels_path.read_text(encoding="utf-8")) if labels_path.exists() else {}
    with requests.Session() as client:
        for key, ids in pool.items():
            values = labels.setdefault(key, {})
            pending = sorted(ids - values.keys())
            while pending:
                batch = pending[:args.judge_batch_size]
                try:
                    judgments = judge_batch(client, args.judge_model,
                                            index["questions"][key]["text"],
                                            [text_by_id[chunk] for chunk in batch], args.judge_cpu)
                except (ValueError, KeyError, requests.RequestException):
                    if len(batch) == 1:
                        raise
                    batch = batch[:1]
                    judgments = judge_batch(client, args.judge_model,
                                            index["questions"][key]["text"],
                                            [text_by_id[batch[0]]], args.judge_cpu)
                values.update(dict(zip(batch, judgments)))
                pending = pending[len(batch):]
                atomic_json(labels_path, labels)
            print(f"Judged {key}: {len(values)} pooled chunks", flush=True)


def budget_scores(ids, labels, words, budget=1000):
    """Relevant words among the first `budget` retrieved words, so chunk size cannot inflate precision."""
    used = relevant = 0
    for chunk in ids:
        take = min(words[chunk], budget - used)
        used += take
        relevant += take if labels[chunk] else 0
        if used >= budget:
            break
    return {
        "relevant_words_at_1000": relevant / budget,
        "relevant_share_of_retrieved_words": relevant / used if used else 0,
        "retrieved_words_top20": sum(words[chunk] for chunk in ids[:20]),
    }


def score_one(ids, labels):
    positives = sum(labels.values())
    gains = [int(labels[chunk]) for chunk in ids]
    def dcg(values):
        return sum(v / math.log2(rank + 1) for rank, v in enumerate(values, 1))
    ideal = sorted(labels.values(), reverse=True)
    first = next((rank for rank, value in enumerate(gains, 1) if value), None)
    average_precision = sum(
        sum(gains[:rank]) / rank for rank, value in enumerate(gains[:20], 1) if value
    ) / positives if positives else None
    return {
        "precision5": sum(gains[:5]) / 5,
        "precision20": sum(gains[:20]) / 20,
        "pool_recall20": sum(gains[:20]) / positives if positives else None,
        "ndcg10": dcg(gains[:10]) / dcg(ideal[:10]) if any(ideal[:10]) else None,
        "ndcg20": dcg(gains[:20]) / dcg(ideal[:20]) if any(ideal[:20]) else None,
        "map20": average_precision,
        "hit10": int(any(gains[:10])),
        "mrr": 1 / first if first else 0,
    }


def score(args):
    index = json.loads((args.output / "rankings.json").read_text(encoding="utf-8"))
    labels = json.loads((args.output / "judgments.json").read_text(encoding="utf-8"))
    chunks, _ = load_corpus(args.source)
    words = {chunk["chunkId"]: len(chunk["text"].split()) for chunk in chunks}
    manifest = json.loads((args.source / "manifest.json").read_text(encoding="utf-8"))
    configurations = {}
    for name, rankings in index["configurations"].items():
        rows = []
        for question, ids in rankings.items():
            if any(chunk not in labels.get(question, {}) for chunk in ids):
                raise RuntimeError(f"Unjudged retrieved chunk in {name}, {question}")
            rows.append(score_one(ids, labels[question]) | budget_scores(ids, labels[question], words))
        configurations[name] = {
            key: round(float(np.mean([row[key] for row in rows if row[key] is not None])), 5)
            for key in rows[0]
        }
    result = {
        "documents": 700, "chunks": len(index["chunk_ids"]),
        "questions": len(index["questions"]),
        "judged_pairs": sum(map(len, labels.values())),
        "judge_model": args.judge_model,
        "relevance": "machine-judged pooled top-20 candidates; pool recall is not absolute corpus recall",
        "chunking": manifest.get("chunking", {"wordSize": 200, "overlapWords": 50}),
        "source": str(args.source.relative_to(ROOT)),
        "configurations": configurations,
    }
    atomic_json(args.output / "summary.json", result)
    for name, values in sorted(configurations.items(), key=lambda entry: -entry[1]["ndcg10"]):
        print(name, values)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase", required=True, choices=("sparse", "retrieve", "judge", "score"))
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--source", type=Path, default=SOURCE,
                        help="Exported corpus directory (default: the v1 screened corpus)")
    parser.add_argument("--models", nargs="+", default=DEFAULT_MODELS)
    parser.add_argument("--normalizations", nargs="+", choices=("raw", "unicode", "folded"),
                        default=("raw", "unicode", "folded"))
    parser.add_argument("--strategies", nargs="+", choices=("dense", "sparse", "hybrid", "mmr"),
                        default=("dense", "sparse", "hybrid", "mmr"))
    parser.add_argument("--scopes", nargs="+", choices=("global", "dimension"),
                        default=("global", "dimension"))
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--judge-model", default="qwen3.5:9b-q4_K_M")
    parser.add_argument("--judge-batch-size", type=int, default=8)
    parser.add_argument("--judge-cpu", action="store_true")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    if args.phase == "sparse":
        args.models = []
        args.strategies = ["sparse"]
        retrieve(args)
    else:
        {"retrieve": retrieve, "judge": judge, "score": score}[args.phase](args)
