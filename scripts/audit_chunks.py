#!/usr/bin/env python3
"""Audit chunk quality in the exported screened corpus and relate it to judged relevance.

Reads calibration/results/screened-corpus/*.pdf.json (the real DocumentChunker
output), the screened benchmark rankings/judgments, and writes
calibration/results/pipeline-audit/audit.json plus example CSVs.
"""

import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

from write_benchmark_report import garbled

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / "calibration" / "results" / "screened-corpus"
BENCHMARK = ROOT / "calibration" / "results" / "screened-benchmark"
OUTPUT = ROOT / "calibration" / "results" / "pipeline-audit"

HYPHEN_SPLIT = re.compile(r"\b[a-z]{2,}- [a-z]{2,}\b")
OCR_NOISE = re.compile(r"[A-Za-z][^\sA-Za-z0-9'’\-/]+[A-Za-z]")
TOC = re.compile(r"(?:\.\s?){4,}\s*\d+|…{2,}\s*\d+")
REFERENCE = re.compile(r"\bet al\.|\bdoi\b|https?://|\b(?:19|20)\d{2}[a-z]?\)|\bvol\.|\bpp\.", re.I)
LATIN_WORD = re.compile(r"[A-Za-z]+")
CYRILLIC = re.compile("[Ѐ-ӿ]")


def junk_heading(section):
    """A section label that is not a plausible heading: mostly non-letters or a short all-caps fragment."""
    if not section:
        return False
    letters = sum(c.isalpha() for c in section)
    return letters / len(section) < 0.6 or (letters < 4) or not re.search(r"[A-Za-zЀ-ӿ]{3,}", section)


def features(chunk):
    text = chunk["text"]
    meta = chunk["metadata"]
    section = meta.get("section")
    body = text[len(section) + 1:] if section and text.startswith(section + "\n") else text
    words = body.split()
    latin = LATIN_WORD.findall(body)
    lower = [w.lower() for w in latin]
    return {
        "words": len(words),
        "section_words": len(section.split()) if section and body is not text else 0,
        "block": meta.get("blockType", "none"),
        "role": meta.get("retrievalRole", "none"),
        "junk_section": junk_heading(section) and body is not text,
        "hyphen_split": bool(HYPHEN_SPLIT.search(body)),
        "ocr_noise": len(OCR_NOISE.findall(body)) / max(len(words), 1),
        "stopword_ratio": sum(w in ENGLISH_STOP_WORDS for w in lower) / len(lower) if len(lower) >= 8 else None,
        "cyrillic": len(CYRILLIC.findall(body)) > 0.3 * max(len(body), 1),
        "toc": bool(TOC.search(body)),
        "reference_like": len(REFERENCE.findall(body)) >= 2,
        "starts_lower": bool(re.match(r"[a-z]", body.strip())),
        "ends_open": bool(body.strip()) and body.strip()[-1] not in ".!?:;\"”')",
        "garbled": garbled(text),
        "normalized": re.sub(r"[^\w]+", " ", body.lower()).strip(),
    }


def bucket(words):
    for limit, name in ((5, "1-5"), (10, "6-10"), (25, "11-25"), (50, "26-50"), (100, "51-100"), (150, "101-150")):
        if words <= limit:
            return name
    return "151+"


def share(values):
    return round(float(np.mean(values)), 4) if len(values) else None


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    chunks, docs = {}, {}
    for path in sorted(CORPUS.glob("*.pdf.json")):
        item = json.loads(path.read_text(encoding="utf-8"))
        name = path.name.removesuffix(".json")
        doc_chunks = item["chunks"]
        rows = []
        for chunk in doc_chunks:
            f = features(chunk)
            f.update(source=name, page=chunk["page"], text=chunk["text"])
            chunks[chunk["chunkId"]] = f
            rows.append(f)
        pages = max((c["page"] for c in doc_chunks), default=0)
        stop = [r["stopword_ratio"] for r in rows if r["stopword_ratio"] is not None]
        docs[name] = {
            "chunks": len(rows), "pages": pages,
            "chunks_per_page": round(len(rows) / max(pages, 1), 1),
            "median_words": float(np.median([r["words"] for r in rows])) if rows else 0,
            "tiny_share": share([r["words"] <= 10 for r in rows]),
            "ocr_noise": share([r["ocr_noise"] for r in rows]),
            "stopword_ratio": share(stop),
            "junk_section_share": share([r["junk_section"] for r in rows]),
            "cyrillic_share": share([r["cyrillic"] for r in rows]),
            "garbled_share": share([r["garbled"] for r in rows]),
        }

    values = list(chunks.values())
    words = np.array([v["words"] for v in values])
    total_words = words.sum()
    # Cross-document exact duplicates of non-trivial text.
    owners = defaultdict(set)
    for v in values:
        if len(v["normalized"].split()) >= 5:
            owners[v["normalized"]].add(v["source"])
    cross_dupes = {k: s for k, s in owners.items() if len(s) >= 3}
    corpus = {
        "chunks": len(values),
        "documents": len(docs),
        "words_percentiles": dict(zip(["p10", "p25", "p50", "p75", "p90", "p99"],
                                      np.percentile(words, [10, 25, 50, 75, 90, 99]).tolist())),
        "chunks_at_or_above_150_words": share(words >= 150),
        "length_buckets": {b: share([bucket(w) == b for w in words]) for b in
                           ["1-5", "6-10", "11-25", "26-50", "51-100", "101-150", "151+"]},
        "share_of_words_in_chunks_le_25": round(float(words[words <= 25].sum() / total_words), 4),
        "block_types": {k: round(c / len(values), 4) for k, c in Counter(v["block"] for v in values).most_common()},
        "auxiliary_role": share([v["role"] == "auxiliary" for v in values]),
        "junk_section_prefix": share([v["junk_section"] for v in values]),
        "section_prefix_word_share": round(sum(v["section_words"] for v in values) /
                                           (total_words + sum(v["section_words"] for v in values)), 4),
        "hyphen_split": share([v["hyphen_split"] for v in values]),
        "ocr_noise_chunks": share([v["ocr_noise"] >= 0.1 for v in values]),
        "toc_like": share([v["toc"] for v in values]),
        "reference_like": share([v["reference_like"] for v in values]),
        "reference_like_but_evidence": share([v["reference_like"] and v["role"] == "evidence" for v in values]),
        "starts_lowercase": share([v["starts_lower"] for v in values]),
        "ends_without_terminal_punctuation": share([v["ends_open"] for v in values]),
        "cyrillic": share([v["cyrillic"] for v in values]),
        "garbled": share([v["garbled"] for v in values]),
        "cross_document_duplicate_texts": len(cross_dupes),
        "cross_document_duplicate_chunks": sum(1 for v in values if v["normalized"] in cross_dupes),
    }
    examples = sorted(cross_dupes.items(), key=lambda item: -len(item[1]))[:15]
    corpus["top_cross_document_duplicates"] = [{"text": k[:120], "documents": len(s)} for k, s in examples]

    # Documents ranked by extraction health.
    poor = sorted(docs.items(), key=lambda item: -(item[1]["chunks_per_page"]))[:25]
    noisy = sorted(((n, d) for n, d in docs.items() if d["stopword_ratio"] is not None and d["cyrillic_share"] < 0.5),
                   key=lambda item: item[1]["stopword_ratio"])[:25]

    # Relate features to judged relevance and to what each retrieval method surfaces.
    index = json.loads((BENCHMARK / "rankings.json").read_text(encoding="utf-8"))
    labels = json.loads((BENCHMARK / "judgments.json").read_text(encoding="utf-8"))
    judged = [(q, c, rel) for q, values_ in labels.items() for c, rel in values_.items()]
    base = np.mean([rel for _, _, rel in judged])

    def relevance_by(key):
        groups = defaultdict(list)
        for _, c, rel in judged:
            groups[key(chunks[c])].append(rel)
        return {str(k): {"pairs": len(v), "relevant": round(float(np.mean(v)), 3)} for k, v in sorted(groups.items(), key=lambda x: str(x[0]))}

    relevance = {
        "base_rate": round(float(base), 3),
        "by_length": relevance_by(lambda f: bucket(f["words"])),
        "by_block_type": relevance_by(lambda f: f["block"]),
        "by_junk_section": relevance_by(lambda f: f["junk_section"]),
        "by_ocr_noise": relevance_by(lambda f: f["ocr_noise"] >= 0.1),
        "by_reference_like": relevance_by(lambda f: f["reference_like"]),
        "by_toc": relevance_by(lambda f: f["toc"]),
        "by_starts_lowercase": relevance_by(lambda f: f["starts_lower"]),
        "by_dimension_match": None,
    }
    groups = defaultdict(list)
    for q, c, rel in judged:
        groups[chunks[c]["source"].startswith(index["questions"][q]["dimension"] + "-")].append(rel)
    relevance["by_dimension_match"] = {str(k): {"pairs": len(v), "relevant": round(float(np.mean(v)), 3)} for k, v in groups.items()}

    retrieved = {}
    for name, rankings in index["configurations"].items():
        top5 = [chunks[c] for ids in rankings.values() for c in ids[:5]]
        top20 = [chunks[c] for ids in rankings.values() for c in ids[:20]]
        retrieved[name] = {
            "top5_median_words": float(np.median([f["words"] for f in top5])),
            "top5_le_25_words": share([f["words"] <= 25 for f in top5]),
            "top20_le_25_words": share([f["words"] <= 25 for f in top20]),
            "top5_junk_section": share([f["junk_section"] for f in top5]),
            "top5_ocr_noise": share([f["ocr_noise"] >= 0.1 for f in top5]),
            "top5_reference_like": share([f["reference_like"] for f in top5]),
            "top5_auxiliary": share([f["role"] == "auxiliary" for f in top5]),
        }

    # Rank-1 irrelevant chunks: what do they look like?
    rank1 = []
    for name, rankings in index["configurations"].items():
        for q, ids in rankings.items():
            c = ids[0]
            if not labels[q][c]:
                rank1.append((name, q, c))
    failure_types = Counter()
    for _, _, c in rank1:
        f = chunks[c]
        failure_types["<=10 words" if f["words"] <= 10 else "11-25 words" if f["words"] <= 25 else ">25 words"] += 1
        if f["junk_section"]:
            failure_types["junk section prefix"] += 1
        if f["ocr_noise"] >= 0.1:
            failure_types["OCR noise"] += 1
        if f["reference_like"]:
            failure_types["reference-like"] += 1
        if f["toc"]:
            failure_types["table of contents"] += 1
        if f["block"] in ("heading", "caption", "header", "footer", "table"):
            failure_types[f"block={f['block']}"] += 1
    result = {
        "corpus": corpus,
        "worst_chunks_per_page": dict(poor),
        "lowest_stopword_ratio_latin_docs": dict(noisy),
        "relevance": relevance,
        "retrieved": retrieved,
        "rank1_irrelevant": {"count": len(rank1), "of": sum(len(r) for r in index["configurations"].values()),
                             "features": dict(failure_types.most_common())},
    }
    (OUTPUT / "audit.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    with (OUTPUT / "rank1_irrelevant.csv").open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.writer(stream)
        writer.writerow(["configuration", "question_id", "question", "source", "page", "words", "block",
                         "junk_section", "ocr_noise", "chunk_text"])
        for name, q, c in rank1:
            f = chunks[c]
            writer.writerow([name, q, index["questions"][q]["text"], f["source"], f["page"], f["words"],
                             f["block"], f["junk_section"], round(f["ocr_noise"], 3), f["text"]])
    print(json.dumps({k: result[k] for k in ("corpus", "relevance", "rank1_irrelevant")}, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
