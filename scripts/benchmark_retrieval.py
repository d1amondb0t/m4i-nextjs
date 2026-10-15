#!/usr/bin/env python3
"""Offline retrieval comparison on the existing default-chunk corpus.

Uses the 200-word/50-overlap a1 corpus and its 1,680 prior machine judgments.
Writes both whole-corpus retrieval diagnostics and metrics on the same fully
judged candidate pool. The latter are pool-ranking metrics, not corpus recall.
No generation or reranking model is used during retrieval.
"""

import argparse
import hashlib
import json
import math
import re
import time
import unicodedata
from collections import defaultdict
from pathlib import Path

import numpy as np
import requests
from sklearn.feature_extraction.text import CountVectorizer

ROOT = Path(__file__).resolve().parents[1]
EXPERIMENT = ROOT / "calibration" / "results" / "experiment"
DEFAULT_MODELS = (
    "qwen3-embedding:0.6b", "qwen3-embedding:0.6b@plain",
    "qwen3-embedding:4b", "bge-m3:latest", "nomic-embed-text:latest",
)
PROFILES = {
    "qwen3-embedding:0.6b": ("", "Instruct: Retrieve passages that answer the question.\nQuery: "),
    "qwen3-embedding:0.6b@plain": ("", ""),
    "qwen3-embedding:4b": ("", "Instruct: Retrieve passages that answer the question.\nQuery: "),
    "bge-m3:latest": ("", ""),
    "nomic-embed-text:latest": ("search_document: ", "search_query: "),
    "hf.co/CompendiumLabs/bge-base-en-v1.5-gguf:latest": (
        "", "Represent this sentence for searching relevant passages: "
    ),
}


def normalize(text, mode):
    if mode == "raw":
        return text
    text = unicodedata.normalize("NFKC", text)
    text = (text.replace("\u00ad", "").replace("ﬁ", "fi").replace("ﬂ", "fl")
            .replace("“", '"').replace("”", '"').replace("’", "'"))
    text = re.sub(r"(?<=\w)-\s+(?=\w)", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    if mode == "unicode":
        return text
    if mode == "folded":
        text = "".join(c for c in unicodedata.normalize("NFKD", text.casefold())
                       if not unicodedata.combining(c))
        return re.sub(r"[^\w]+", " ", text, flags=re.UNICODE).strip()
    raise ValueError(mode)


def load_data():
    corpus = json.loads((EXPERIMENT / "chunks-a1.json").read_text(encoding="utf-8"))["chunks"]
    ontology = json.loads((ROOT / "ontology.json").read_text(encoding="utf-8"))
    questions = {
        f"{category['id']}#{number}": question
        for dimension in ontology["dimensions"]
        for category in dimension["categories"]
        for number, question in enumerate(category["questions"], 1)
    }
    votes = defaultdict(list)
    for file in sorted(EXPERIMENT.glob("scored-a1.b1.c1-d*.json")):
        for row in json.loads(file.read_text(encoding="utf-8")):
            for observation in row["observations"]:
                votes[(row["questionId"], observation["chunkId"])].append(
                    bool(observation["relevant"])
                )
    if len(votes) != 1680 or any(len(v) != 7 or len(set(v)) != 1 for v in votes.values()):
        raise RuntimeError("The machine-judged pool differs from the expected 1,680 consistent pairs")
    ids = {chunk["chunkId"]: index for index, chunk in enumerate(corpus)}
    judgments = defaultdict(dict)
    for (question, chunk), vote in votes.items():
        if chunk not in ids:
            raise RuntimeError(f"Judged chunk missing from corpus: {chunk}")
        judgments[question][ids[chunk]] = int(vote[0])
    if set(judgments) != set(questions):
        raise RuntimeError("Question set differs from the judgment pool")
    return corpus, questions, judgments


def embed_truncated(client, model, text, start):
    """Embed one input, halving it until it fits the model context.

    Only garbled text layers (where each character is several tokens) exceed
    the context of 200-word chunks; Ollama rejects them even with truncate.
    """
    while True:
        response = client.post("http://127.0.0.1:11434/api/embed", json={"model": model, "input": [text]}, timeout=600)
        if response.ok:
            return response.json()["embeddings"][0]
        if response.status_code != 400 or "context length" not in response.text or len(text) < 2:
            raise RuntimeError(f"{model} embedding input {start}: HTTP {response.status_code}: {response.text[:500]}")
        text = text[:len(text) // 2]
        print(f"  {model}: truncated input {start} to {len(text)} characters", flush=True)


def embed(client, model, texts, cache_path, batch_size):
    state = cache_path.with_suffix(".json")
    if cache_path.exists():
        vectors = np.lib.format.open_memmap(cache_path, mode="r+")
        completed = json.loads(state.read_text())["completed"] if state.exists() else len(texts)
        if len(vectors) != len(texts):
            raise RuntimeError(f"Stale embedding cache: {cache_path}")
    else:
        first = client.post("http://127.0.0.1:11434/api/embed", json={"model": model, "input": [texts[0]]}, timeout=300)
        first.raise_for_status()
        vector = first.json()["embeddings"][0]
        vectors = np.lib.format.open_memmap(cache_path, mode="w+", dtype="float32", shape=(len(texts), len(vector)))
        vectors[0] = vector
        completed = 1
    for start in range(completed, len(texts), batch_size):
        batch = texts[start:start + batch_size]
        for attempt in range(3):
            response = client.post("http://127.0.0.1:11434/api/embed", json={"model": model, "input": batch}, timeout=600)
            if response.ok:
                break
            if attempt < 2:
                time.sleep(2**attempt)
        if response.status_code == 400 and "context length" in response.text:
            values = [embed_truncated(client, model, text, start + offset) for offset, text in enumerate(batch)]
        elif not response.ok:
            raise RuntimeError(f"{model} embedding batch at {start}: HTTP {response.status_code}: {response.text[:500]}")
        else:
            values = response.json()["embeddings"]
        if len(values) != len(batch):
            raise RuntimeError(f"{model} returned {len(values)} vectors for {len(batch)} inputs")
        vectors[start:start + len(batch)] = values
        vectors.flush()
        state.write_text(json.dumps({"completed": start + len(batch)}))
        if (start // batch_size) % 10 == 0:
            print(f"  {model}: {start + len(batch)}/{len(texts)} embeddings", flush=True)
    return np.asarray(vectors)


def unit(vectors):
    vectors = np.asarray(vectors, dtype=np.float32)
    return vectors / np.maximum(np.linalg.norm(vectors, axis=1, keepdims=True), 1e-12)


def bm25_scores(documents, queries):
    vectorizer = CountVectorizer(token_pattern=r"(?u)\b\w\w+\b", lowercase=True)
    counts = vectorizer.fit_transform(documents).tocsr().astype(np.float32)
    lengths = np.asarray(counts.sum(axis=1)).ravel()
    average = max(float(lengths.mean()), 1)
    frequencies = np.asarray((counts > 0).sum(axis=0)).ravel()
    idf = np.log1p((len(documents) - frequencies + 0.5) / (frequencies + 0.5))
    row_index = np.repeat(np.arange(len(documents)), np.diff(counts.indptr))
    counts.data *= (2.2 / (counts.data + 1.2 * (0.25 + 0.75 * lengths[row_index] / average)))
    counts.data *= idf[counts.indices]
    query_counts = vectorizer.transform(queries)
    query_counts.data[:] = 1
    return np.asarray((query_counts @ counts.T).toarray(), dtype=np.float32)


def order(scores, candidates=None):
    indices = np.arange(len(scores)) if candidates is None else np.asarray(candidates)
    return sorted(indices, key=lambda index: (-float(scores[index]), int(index)))


def rrf(dense, sparse, candidates, k=60, cutoff=None):
    dense_order = order(dense, candidates)
    sparse_order = order(sparse, candidates)
    dense_rank = {index: rank for rank, index in enumerate(dense_order[:cutoff], 1)}
    sparse_rank = {index: rank for rank, index in enumerate(sparse_order[:cutoff], 1)}
    return sorted(candidates, key=lambda index: (
        -(1 / (k + dense_rank[index]) if index in dense_rank else 0)
        -(1 / (k + sparse_rank[index]) if index in sparse_rank else 0),
        index,
    ))


def mmr(dense, vectors, candidates, limit=20, balance=0.7):
    available = order(dense, candidates)[:max(40, limit)]
    selected = []
    if not available:
        return selected
    low, high = min(dense[available]), max(dense[available])
    while available and len(selected) < limit:
        def value(index):
            relevance = (dense[index] - low) / max(high - low, 1e-12)
            redundancy = max((float(vectors[index] @ vectors[other]) for other in selected), default=0)
            return balance * relevance - (1 - balance) * redundancy
        best = max(available, key=lambda index: (value(index), -index))
        selected.append(best)
        available.remove(best)
    return selected


def metrics(ranking, labels):
    relevant = sum(labels.values())
    def precision(k):
        return sum(labels.get(i, 0) for i in ranking[:k]) / k
    def recall(k):
        return sum(labels.get(i, 0) for i in ranking[:k]) / relevant if relevant else None
    def dcg(items):
        return sum(labels.get(i, 0) / math.log2(rank + 1) for rank, i in enumerate(items, 1))
    ideal = sorted(labels, key=lambda i: -labels[i])
    ideal_dcg = dcg(ideal[:10])
    ideal_dcg20 = dcg(ideal[:20])
    first = next((rank for rank, i in enumerate(ranking, 1) if labels.get(i, 0)), None)
    average_precision = sum(
        sum(labels.get(i, 0) for i in ranking[:rank]) / rank
        for rank, item in enumerate(ranking[:20], 1) if labels.get(item, 0)
    ) / relevant if relevant else None
    return {
        "precision5": precision(5), "precision20": precision(20),
        "recall5": recall(5), "recall20": recall(20),
        "ndcg10": dcg(ranking[:10]) / ideal_dcg if ideal_dcg else None,
        "ndcg20": dcg(ranking[:20]) / ideal_dcg20 if ideal_dcg20 else None,
        "map20": average_precision,
        "hit10": int(any(labels.get(i, 0) for i in ranking[:10])),
        "mrr": 1 / first if first else 0,
        "judged20": sum(i in labels for i in ranking[:20]) / 20,
    }


def mean_metrics(rows):
    return {key: round(float(np.mean([r[key] for r in rows if r[key] is not None])), 5)
            for key in rows[0]}


def run(args):
    corpus, questions, judgments = load_data()
    args.output.mkdir(parents=True, exist_ok=True)
    keys = list(questions)
    results = []
    with requests.Session() as client:
        for mode in args.normalizations:
            docs = [normalize(chunk["text"], mode) for chunk in corpus]
            queries = [normalize(questions[key], mode) for key in keys]
            sparse = bm25_scores(docs, queries)
            for model in args.models:
                if model not in PROFILES:
                    raise ValueError(f"Unknown model profile: {model}")
                doc_prefix, query_prefix = PROFILES[model]
                actual_model = model.split("@")[0]
                cache_id = hashlib.sha256(f"{actual_model}|{mode}|{doc_prefix}".encode()).hexdigest()[:12]
                query_id = hashlib.sha256(f"{actual_model}|{mode}|{query_prefix}".encode()).hexdigest()[:12]
                vectors = unit(embed(client, actual_model, [doc_prefix + doc for doc in docs], args.output / f"embeddings-{cache_id}.npy", args.batch_size))
                query_vectors = unit(embed(client, actual_model, [query_prefix + query for query in queries], args.output / f"queries-{query_id}.npy", args.batch_size))
                dense = query_vectors @ vectors.T
                for strategy in ("dense", "sparse", "hybrid", "mmr"):
                    pooled, full = [], []
                    for row, key in enumerate(keys):
                        pool = list(judgments[key])
                        if strategy == "dense":
                            pool_rank = order(dense[row], pool)
                            full_rank = order(dense[row])[:20]
                        elif strategy == "sparse":
                            pool_rank = order(sparse[row], pool)
                            full_rank = order(sparse[row])[:20]
                        elif strategy == "hybrid":
                            pool_rank = rrf(dense[row], sparse[row], pool)
                            dense_top = order(dense[row])[:100]
                            sparse_top = order(sparse[row])[:100]
                            full_rank = rrf(dense[row], sparse[row], sorted(set(dense_top + sparse_top)), cutoff=100)[:20]
                        else:
                            pool_rank = mmr(dense[row], vectors, pool)
                            full_rank = mmr(dense[row], vectors, order(dense[row])[:100])
                        pooled.append(metrics(pool_rank, judgments[key]))
                        full.append(metrics(full_rank, judgments[key]))
                    result = {
                        "model": model, "normalization": mode, "strategy": strategy,
                        "pool_ranking": mean_metrics(pooled),
                        "full_corpus_known_labels": mean_metrics(full),
                    }
                    results.append(result)
                    print(f"{mode} {model} {strategy}: {result['pool_ranking']}", flush=True)
                (args.output / "summary.json").write_text(json.dumps({
                    "corpus_chunks": len(corpus), "questions": len(keys),
                    "judged_pairs": sum(map(len, judgments.values())),
                    "judgment_source": "Prior machine labels on a baseline-retrieved pool; not exhaustive relevance ground truth",
                    "chunking": {"word_size": 200, "overlap_words": 50},
                    "results": results,
                }, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", nargs="+", default=DEFAULT_MODELS)
    parser.add_argument("--normalizations", nargs="+", choices=("raw", "unicode", "folded"), default=("raw", "unicode", "folded"))
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--output", type=Path, default=ROOT / "calibration" / "results" / "retrieval-benchmark")
    run(parser.parse_args())
