#!/usr/bin/env python3
"""Compare chunk statistics and audit defects across exported chunking variants.

Reads calibration/results/screened-corpus (v1) and every directory under
calibration/results/chunking-variants, then writes
calibration/results/chunking-variants/comparison.json and prints a table.
"""

import json
import re
from collections import Counter
from pathlib import Path

import numpy as np

from audit_chunks import features

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "calibration" / "results"
VARIANTS = RESULTS / "chunking-variants"
TOKEN = re.compile(r"\w+")


def two_column_prose(text):
    rows = [line.split(" | ") for line in text.split("\n") if " | " in line]
    if not rows:
        return False
    prose = sum(1 for row in rows if len(row) == 2 and all(
        len(cell.split()) >= 4 and sum(ch.isdigit() for ch in cell) < 0.15 * len(cell) for cell in row))
    return prose / len(rows) >= 0.5


def load(directory):
    documents = {}
    for path in sorted(directory.glob("*.pdf.json")):
        documents[path.name.removesuffix(".json")] = json.loads(path.read_text(encoding="utf-8"))["chunks"]
    return documents


def evidence_tokens(chunks):
    """Tokens of chunks that carry document content (not page furniture or standalone headings)."""
    counts = Counter()
    for chunk in chunks:
        if chunk["metadata"].get("blockType") in ("header", "footer", "heading"):
            continue
        counts.update(TOKEN.findall(features(chunk)["normalized"]))
    return counts


LATIN = re.compile(r"[A-Za-z]+")


HYPHEN_SPLIT = re.compile(r"\b[a-z]{2,}- [a-z]{2,}\b")


def word_artifacts(text, vocabulary):
    """Counts of (hyphen splits "popu- lation", split words "Developme nt", joined words "theproject")."""
    words = LATIN.findall(text)
    split = sum(
        1 for a, b in zip(words, words[1:])
        if len(a + b) >= 6 and vocabulary[(a + b).lower()] >= 100 and
        (vocabulary[a.lower()] < 30 or vocabulary[b.lower()] < 30) and f"{a} {b}" in text)
    joined = 0
    for word in words:
        lower = word.lower()
        if len(lower) >= 10 and vocabulary[lower] < 3 and any(
                vocabulary[lower[:i]] >= 200 and vocabulary[lower[i:]] >= 200 for i in range(3, len(lower) - 2)):
            joined += 1
    return len(HYPHEN_SPLIT.findall(text)), split, joined


def summarize(documents, reference=None, vocabulary=None):
    rows = [features(chunk) | {"text": chunk["text"]} for chunks in documents.values() for chunk in chunks]
    words = np.array([row["words"] for row in rows])
    summary = {
        "documents": len(documents),
        "chunks": len(rows),
        "chunks_per_document_median": float(np.median([len(c) for c in documents.values()])),
        "words": {k: float(v) for k, v in zip(("p10", "p25", "p50", "p75", "p90", "mean"),
                                               [*np.percentile(words, [10, 25, 50, 75, 90]), words.mean()])},
        "le_10_words": round(float(np.mean(words <= 10)), 4),
        "le_25_words": round(float(np.mean(words <= 25)), 4),
        "ge_100_words": round(float(np.mean(words >= 100)), 4),
        "ge_150_words": round(float(np.mean(words >= 150)), 4),
        "indexed_words": int(words.sum() + sum(row["section_words"] for row in rows)),
        "block_types": {k: round(v / len(rows), 4) for k, v in Counter(row["block"] for row in rows).most_common()},
        "junk_section_prefix": round(float(np.mean([row["junk_section"] for row in rows])), 4),
        "section_prefix_word_share": round(sum(row["section_words"] for row in rows) /
                                           max(1, words.sum() + sum(row["section_words"] for row in rows)), 4),
        "starts_lowercase": round(float(np.mean([row["starts_lower"] for row in rows])), 4),
        "ends_without_terminal_punctuation": round(float(np.mean([row["ends_open"] for row in rows])), 4),
        "hyphen_split": round(float(np.mean([row["hyphen_split"] for row in rows])), 4),
        "two_column_prose_tables": round(float(np.mean([two_column_prose(row["text"]) for row in rows])), 4),
        "auxiliary_role": round(float(np.mean([row["role"] == "auxiliary" for row in rows])), 4),
    }
    if vocabulary is not None:
        totals = np.array([word_artifacts(row["text"], vocabulary) for row in rows]).sum(axis=0)
        per_thousand = 1000 / max(1, words.sum())
        summary["hyphen_splits_per_1k_words"] = round(float(totals[0] * per_thousand), 3)
        summary["split_words_per_1k_words"] = round(float(totals[1] * per_thousand), 3)
        summary["joined_words_per_1k_words"] = round(float(totals[2] * per_thousand), 3)
    if reference is not None:
        recalls, duplication = [], []
        for name, chunks in documents.items():
            ref = reference.get(name)
            if not ref:
                continue
            ours = evidence_tokens(chunks)
            theirs = evidence_tokens(ref)
            total = sum(theirs.values())
            if total:
                recalls.append(sum(min(count, ours[token]) for token, count in theirs.items()) / total)
            unique = sum(min(count, theirs[token]) for token, count in ours.items())
            if unique:
                duplication.append(sum(ours.values()) / unique)
        summary["v1_token_coverage_median"] = round(float(np.median(recalls)), 4)
        summary["v1_token_coverage_p5"] = round(float(np.percentile(recalls, 5)), 4)
        summary["documents_below_95pct_coverage"] = int(sum(r < 0.95 for r in recalls))
        summary["word_duplication_ratio_median"] = round(float(np.median(duplication)), 3)
    return summary


def main():
    v1 = load(RESULTS / "screened-corpus")
    vocabulary = Counter(word.lower() for chunks in v1.values() for chunk in chunks
                         for word in LATIN.findall(chunk["text"]))
    result = {"v1": summarize(v1, vocabulary=vocabulary)}
    # A variant is complete once its export wrote manifest.json.
    for directory in sorted(path for path in VARIANTS.iterdir() if (path / "manifest.json").exists()):
        result[directory.name] = summarize(load(directory), v1, vocabulary)
    (VARIANTS / "comparison.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    keys = ["documents", "chunks", "le_10_words", "le_25_words", "ge_100_words", "ge_150_words",
            "indexed_words", "junk_section_prefix", "section_prefix_word_share", "starts_lowercase",
            "ends_without_terminal_punctuation", "two_column_prose_tables", "auxiliary_role",
            "hyphen_splits_per_1k_words", "split_words_per_1k_words", "joined_words_per_1k_words",
            "v1_token_coverage_median", "v1_token_coverage_p5", "documents_below_95pct_coverage",
            "word_duplication_ratio_median"]
    names = list(result)
    print(f"{'metric':36s}" + "".join(f"{name:>14s}" for name in names))
    for key in ["words.p25", "words.p50", "words.p75", "words.mean"] + keys:
        values = [result[n]["words"][key.split(".")[1]] if key.startswith("words.") else result[n].get(key, "")
                  for n in names]
        print(f"{key:36s}" + "".join(f"{v:>14.4g}" if isinstance(v, (int, float)) else f"{str(v):>14s}"
                                       for v in values))
    for name in names:
        print(name, "block types", result[name]["block_types"])


if __name__ == "__main__":
    main()
