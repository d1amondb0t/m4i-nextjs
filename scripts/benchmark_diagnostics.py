#!/usr/bin/env python3
"""Paired bootstrap CIs and retrieved-chunk composition for the screened benchmark.

Run after --phase score. Prints NDCG@10 differences with 95% bootstrap intervals
over the 84 questions, the share of garbled/Cyrillic/off-dimension chunks in each
top 20, and NDCG@10 per impact dimension for the leading configurations.
"""
import json
import re

import numpy as np

from benchmark_screened import OUTPUT, load_corpus, score_one
from write_benchmark_report import garbled

index = json.loads((OUTPUT / "rankings.json").read_text(encoding="utf-8"))
labels = json.loads((OUTPUT / "judgments.json").read_text(encoding="utf-8"))
configs = index["configurations"]
questions = list(index["questions"])
per_q = {name: np.array([score_one(configs[name][q], labels[q])["ndcg10"] or 0 for q in questions])
         for name in configs}

rng = np.random.default_rng(0)
samples = rng.integers(0, len(questions), size=(10000, len(questions)))
pairs = [
    ("unicode|bge-m3:latest|hybrid|dimension", "folded|qwen3-embedding:4b|hybrid|dimension"),
    ("unicode|bge-m3:latest|hybrid|dimension", "unicode|bge-m3:latest|hybrid"),
    ("unicode|bge-m3:latest|hybrid|dimension", "unicode|bge-m3:latest|dense|dimension"),
    ("unicode|bge-m3:latest|hybrid", "unicode|bm25|sparse"),
    ("unicode|bge-m3:latest|dense", "folded|qwen3-embedding:4b|dense"),
    ("folded|qwen3-embedding:4b|dense", "folded|bm25|sparse"),
    ("folded|qwen3-embedding:4b|hybrid", "folded|qwen3-embedding:4b|dense"),
    ("unicode|bge-m3:latest|mmr", "unicode|bge-m3:latest|dense"),
    ("unicode|bm25|sparse", "raw|bm25|sparse"),
    ("unicode|bm25|sparse|dimension", "unicode|bm25|sparse"),
]
print("Paired bootstrap of NDCG@10 difference (A - B), 84 questions, 10k resamples")
for a, b in pairs:
    diff = per_q[a] - per_q[b]
    boot = diff[samples].mean(axis=1)
    low, high = np.percentile(boot, [2.5, 97.5])
    wins = (diff > 0).sum(), (diff < 0).sum()
    print(f"{diff.mean():+.3f} [{low:+.3f}, {high:+.3f}] wins {wins[0]}/{wins[1]}  {a}  vs  {b}")

chunks, _ = load_corpus()
by_id = {c["chunkId"]: c for c in chunks}
cyrillic = re.compile("[\u0400-\u04ff]")
print("\nTop-20 composition: garbled / Cyrillic / other-dimension share, relevance of garbled")
for name in sorted(configs):
    ids = [(q, c) for q in questions for c in configs[name][q]]
    bad = [(q, c) for q, c in ids if garbled(by_id[c]["text"])]
    cyr = sum(len(cyrillic.findall(by_id[c]["text"])) > 0.3 * len(by_id[c]["text"]) for _, c in ids)
    off = sum(not by_id[c]["source"].startswith(index["questions"][q]["dimension"] + "-") for q, c in ids)
    rel = sum(labels[q][c] for q, c in bad)
    print(f"{name:45s} garbled {len(bad)/len(ids):.3f} (relevant {rel}/{len(bad)})  cyrillic {cyr/len(ids):.3f}  off-dimension {off/len(ids):.3f}")

# Per-dimension NDCG@10 for leading configs
dims = sorted({v["dimension"] for v in index["questions"].values()})
print("\nNDCG@10 by dimension")
lead = ["unicode|bge-m3:latest|hybrid|dimension", "folded|qwen3-embedding:4b|hybrid|dimension",
        "folded|qwen3-embedding:4b|dense", "unicode|bm25|sparse|dimension"]
print(f"{'dimension':22s}" + "".join(f"{n.split('|')[1][:10]+'|'+'|'.join(n.split('|')[2:]):>26s}" for n in lead))
for d in dims:
    rows = [i for i, q in enumerate(questions) if index["questions"][q]["dimension"] == d]
    print(f"{d:22s}" + "".join(f"{per_q[n][rows].mean():26.3f}" for n in lead))
