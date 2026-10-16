#!/usr/bin/env python3
"""Analyse the app's retrieval strategies and cross-encoder rerankers on judged pairs.

Run after evaluate_app_retrieval.test.ts, the screened benchmark's judge and score
phases on the v4-flow output, and evaluate_rerankers.test.ts. Writes
calibration/results/app-retrieval/analysis.json and prints a summary.
"""

import json
import math
from pathlib import Path

import numpy as np

from benchmark_screened import score_one

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "calibration" / "results" / "app-retrieval"
BENCHMARK = ROOT / "calibration" / "results" / "screened-benchmark-v4-flow"
HIERARCHY_TOP_K = 12
THRESHOLDS = (0.001, 0.01, 0.05, 0.1, 0.2, 0.3, 0.45, 0.6)


def sigmoid(value):
    return 1 / (1 + math.exp(-value))


def bootstrap(differences, seed=0):
    differences = np.asarray(differences, dtype=float)
    samples = np.random.default_rng(seed).integers(0, len(differences), (10000, len(differences)))
    low, high = np.percentile(differences[samples].mean(axis=1), [2.5, 97.5])
    return {"mean": round(float(differences.mean()), 4), "low": round(float(low), 4), "high": round(float(high), 4)}


def auc(positive, negative):
    if not positive or not negative:
        return None
    scores = np.array(positive + negative)
    ranks = scores.argsort().argsort() + 1
    return round(float((ranks[: len(positive)].sum() - len(positive) * (len(positive) + 1) / 2)
                       / (len(positive) * len(negative))), 4)


def main():
    labels = json.loads((BENCHMARK / "judgments.json").read_text(encoding="utf-8"))
    summary = json.loads((BENCHMARK / "summary.json").read_text(encoding="utf-8"))["configurations"]
    rankings = json.loads((BENCHMARK / "rankings.json").read_text(encoding="utf-8"))["configurations"]
    questions = sorted(labels)
    per_question = {name: {q: score_one(ids, labels[q]) for q, ids in configs.items()}
                    for name, configs in rankings.items() if name.startswith("app-")}

    metrics = ("precision5", "ndcg10", "mrr", "relevant_share_of_retrieved_words")
    strategies = {name: {m: summary[name][m] for m in metrics} for name in sorted(summary) if name.startswith("app-")}

    def compare(left, right, metric="ndcg10"):
        return bootstrap([(per_question[left][q][metric] or 0) - (per_question[right][q][metric] or 0) for q in questions])

    comparisons = {
        "bm25 avg_len 100 vs 256": compare("app-avg100|qdrant-bm25|sparse", "app-avg256|qdrant-bm25|sparse"),
        "hybrid avg_len 100 vs 256": compare("app-avg100|bge-base|hybrid", "app-avg256|bge-base|hybrid"),
        "hybrid vs dense (avg_len 100)": compare("app-avg100|bge-base|hybrid", "app-avg100|bge-base|dense"),
        "hybrid vs bm25 (avg_len 100)": compare("app-avg100|bge-base|hybrid", "app-avg100|qdrant-bm25|sparse"),
    }

    scores = json.loads((APP / "reranker-scores-avg100.json").read_text(encoding="utf-8"))["models"]
    rerankers = {}
    for model, by_mode in scores.items():
        if "error" in by_mode:
            rerankers[model] = {"error": by_mode["error"][:300]}
            continue
        rerankers[model] = {}
        for mode, by_question in by_mode.items():
            entry = {}
            positive = [by_question[q][c] for q in questions for c in by_question[q] if labels[q].get(c)]
            negative = [by_question[q][c] for q in questions for c in by_question[q] if labels[q].get(c) is False]
            entry["auc"] = auc(positive, negative)
            for base in ("dense", "hybrid"):
                name = f"app-avg100|bge-base|{base}"
                reordered = {q: sorted(rankings[name][q], key=lambda c: -by_question[q][c]) for q in questions}
                rows = {q: score_one(ids, labels[q]) for q, ids in reordered.items()}
                entry[f"rerank_{base}"] = {
                    m: round(float(np.mean([rows[q][m] or 0 for q in questions])), 4) for m in ("precision5", "ndcg10", "mrr")}
                entry[f"rerank_{base}_vs_{base}_ndcg10"] = bootstrap(
                    [(rows[q]["ndcg10"] or 0) - (per_question[name][q]["ndcg10"] or 0) for q in questions])
            # Hierarchy path: dense candidates, rerank, keep top 12, then apply a probability threshold.
            thresholds = {}
            for threshold in THRESHOLDS:
                kept, relevant_kept, relevant_total, empty = 0, 0, 0, 0
                for q in questions:
                    ordered = sorted(rankings["app-avg100|bge-base|dense"][q], key=lambda c: -by_question[q][c])
                    top = ordered[:HIERARCHY_TOP_K]
                    passing = [c for c in top if sigmoid(by_question[q][c]) >= threshold]
                    kept += len(passing)
                    relevant_kept += sum(labels[q][c] for c in passing)
                    relevant_total += sum(labels[q][c] for c in top)
                    empty += not passing
                thresholds[str(threshold)] = {
                    "questions_with_no_chunk": empty,
                    "chunks_kept_per_question": round(kept / len(questions), 2),
                    "precision_of_kept": round(relevant_kept / kept, 4) if kept else None,
                    "recall_of_relevant_in_top12": round(relevant_kept / relevant_total, 4) if relevant_total else None,
                }
            entry["hierarchy_thresholds"] = thresholds
            rerankers[model][mode] = entry

    result = {"strategies": strategies, "comparisons": comparisons, "rerankers": rerankers}
    (APP / "analysis.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")

    print("App strategies (84 questions, judged pooled top 20):")
    for name, values in strategies.items():
        print(f"  {name:36s}" + "  ".join(f"{m}={v:.3f}" for m, v in values.items()))
    print("NDCG@10 differences (95% bootstrap):")
    for name, value in comparisons.items():
        print(f"  {name:32s} {value['mean']:+.3f} [{value['low']:+.3f}, {value['high']:+.3f}]")
    for model, by_mode in rerankers.items():
        if "error" in by_mode:
            print(model, "unavailable:", by_mode["error"][:120])
            continue
        for mode, entry in by_mode.items():
            d, h = entry["rerank_dense_vs_dense_ndcg10"], entry["rerank_hybrid_vs_hybrid_ndcg10"]
            print(f"{model} [{mode}] AUC={entry['auc']}  rerank dense NDCG@10={entry['rerank_dense']['ndcg10']:.3f} "
                  f"({d['mean']:+.3f} [{d['low']:+.3f},{d['high']:+.3f}])  rerank hybrid NDCG@10="
                  f"{entry['rerank_hybrid']['ndcg10']:.3f} ({h['mean']:+.3f} [{h['low']:+.3f},{h['high']:+.3f}])")
            for threshold, values in entry["hierarchy_thresholds"].items():
                print(f"    threshold {threshold:>6s}: empty questions {values['questions_with_no_chunk']:2d}, "
                      f"kept/question {values['chunks_kept_per_question']:5.2f}, precision {values['precision_of_kept']}, "
                      f"recall {values['recall_of_relevant_in_top12']}")


if __name__ == "__main__":
    main()
