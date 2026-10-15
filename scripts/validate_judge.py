#!/usr/bin/env python3
"""Sanity-check the pooled relevance judge against earlier machine labels."""

import json
from pathlib import Path

import requests

from benchmark_retrieval import EXPERIMENT, load_data
from benchmark_screened import judge_batch


def main():
    chunks, questions, labels = load_data()
    comparisons = []
    with requests.Session() as client:
        for key, question in questions.items():
            positive = next((i for i, label in labels[key].items() if label), None)
            negative = next((i for i, label in labels[key].items() if not label), None)
            if positive is None or negative is None:
                continue
            predicted = judge_batch(client, "qwen3.5:9b-q4_K_M", question,
                                    [chunks[positive]["text"], chunks[negative]["text"]], cpu=True)
            comparisons.append({"question": key, "positive": predicted[0], "negative": predicted[1]})
            print(f"{len(comparisons)} {key}: {predicted}", flush=True)
    result = {
        "question_pairs": len(comparisons),
        "prior_label_source": "machine judgments in scored-a1.b1.c1-d*.json",
        "judge_model": "qwen3.5:9b-q4_K_M",
        "positive_agreement": sum(x["positive"] for x in comparisons) / len(comparisons),
        "negative_agreement": sum(not x["negative"] for x in comparisons) / len(comparisons),
        "comparisons": comparisons,
    }
    target = Path(EXPERIMENT).parent / "screened-benchmark" / "judge-validation.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(result["positive_agreement"], result["negative_agreement"])


if __name__ == "__main__":
    main()
