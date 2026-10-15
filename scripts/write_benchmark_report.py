#!/usr/bin/env python3
"""Write readable tables from the retrieval benchmark JSON outputs."""

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "calibration" / "results"
OUTPUT = RESULTS / "retrieval-report"


def format_number(value):
    return "—" if value is None else f"{value:.3f}"


def save_csv(path, rows, encoding="utf-8"):
    if not rows:
        return
    with path.open("w", newline="", encoding=encoding) as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def garbled(text):
    """Detect broken font encodings: control characters or Latin Extended glyph codes instead of words."""
    if not text:
        return False
    control = sum(ord(c) < 32 and c not in "\n\r\t" for c in text) / len(text)
    extended = sum(0x100 <= ord(c) <= 0x24F for c in text) / len(text)
    return control > 0.03 or extended > 0.5


def corrupted_documents():
    documents, total = [], 0
    for path in sorted((RESULTS / "screened-corpus").glob("*.pdf.json")):
        chunks = json.loads(path.read_text(encoding="utf-8"))["chunks"]
        count = sum(garbled(chunk["text"]) for chunk in chunks)
        total += count
        if chunks and count / len(chunks) >= 0.25:
            documents.append((path.name.removesuffix(".json"), count, len(chunks)))
    return documents, total


def question_pairs(benchmark):
    """One row per machine-judged question–chunk pair, with each configuration's rank for it."""
    index = json.loads((benchmark / "rankings.json").read_text(encoding="utf-8"))
    labels = json.loads((benchmark / "judgments.json").read_text(encoding="utf-8"))
    ranks = {}
    for name, rankings in index["configurations"].items():
        for question, ids in rankings.items():
            for rank, chunk in enumerate(ids, 1):
                ranks.setdefault((question, chunk), {})[name] = rank
    wanted = {chunk for values in labels.values() for chunk in values}
    chunks = {}
    for path in sorted((RESULTS / "screened-corpus").glob("*.pdf.json")):
        for chunk in json.loads(path.read_text(encoding="utf-8"))["chunks"]:
            if chunk["chunkId"] in wanted:
                chunks[chunk["chunkId"]] = chunk
    rows = []
    for question, values in labels.items():
        meta = index["questions"][question]
        for chunk_id, relevant in values.items():
            chunk = chunks[chunk_id]
            found = ranks.get((question, chunk_id), {})
            rows.append({
                "question_id": question,
                "question_dimension": meta["dimension"],
                "question": meta["text"],
                "chunk_id": chunk_id,
                "source": chunk["source"],
                "source_dimension": chunk["source"].rsplit("-", 1)[0],
                "page": chunk["page"],
                "relevant": "yes" if relevant else "no",
                "configurations_retrieving": len(found),
                "best_rank": min(found.values(), default=""),
                "retrieved_by": "; ".join(f"{name}@{rank}" for name, rank in sorted(found.items(), key=lambda item: item[1])),
                "garbled_text": "yes" if garbled(chunk["text"]) else "no",
                "chunk_text": chunk["text"],
            })
    order = list(index["questions"])
    rows.sort(key=lambda row: (order.index(row["question_id"]), row["best_rank"] == "", row["best_rank"] or 0))
    return rows


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    verification = json.loads((RESULTS / "screened-corpus" / "verification.json").read_text(encoding="utf-8"))
    controlled = json.loads((RESULTS / "retrieval-benchmark" / "summary.json").read_text(encoding="utf-8"))
    rows = []
    for result in controlled["results"]:
        rows.append({"normalization": result["normalization"], "model": result["model"],
                     "strategy": result["strategy"], **result["pool_ranking"]})
    save_csv(OUTPUT / "controlled_metrics.csv", rows)
    best_by_model = {}
    for row in rows:
        best = best_by_model.get(row["model"])
        if best is None or row["ndcg10"] > best["ndcg10"]:
            best_by_model[row["model"]] = row

    lines = [
        "# Retrieval comparison",
        "",
        f"**Screened corpus:** {verification['documents']} distinct PDFs, {verification['chunks']:,} default chunks, zero OCR or quarantined documents.",
        "",
        "## Controlled 110-document comparison",
        "",
        "The prior machine-labeled pool contains 1,680 question–chunk pairs across 84 questions. Every method orders the same 20 judged candidates per question. These figures measure ordering within that pool; they are not absolute corpus recall.",
        "",
        "| Embedder | Best normalization | Retrieval | Precision@5 | Recall@5 in pool | NDCG@10 | NDCG@20 | MAP@20 |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for model, row in sorted(best_by_model.items(), key=lambda item: -item[1]["ndcg10"]):
        lines.append(f"| {model} | {row['normalization']} | {row['strategy']} | "
                     f"{format_number(row['precision5'])} | {format_number(row['recall5'])} | "
                     f"{format_number(row['ndcg10'])} | {format_number(row['ndcg20'])} | "
                     f"{format_number(row['map20'])} |")
    lines.extend(["", "[All controlled configurations](controlled_metrics.csv)", ""])

    screened_path = RESULTS / "screened-benchmark" / "summary.json"
    if screened_path.exists():
        screened = json.loads(screened_path.read_text(encoding="utf-8"))
        full_rows = []
        for name, metrics in screened["configurations"].items():
            full_rows.append({"configuration": name, **metrics})
        save_csv(OUTPUT / "screened_metrics.csv", full_rows)
        # utf-8-sig so spreadsheet apps show accented and Cyrillic text correctly.
        save_csv(OUTPUT / "question_pairs.csv", question_pairs(screened_path.parent), encoding="utf-8-sig")
        lines.extend([
            "## Screened 700-document retrieval",
            "",
            f"{screened['judged_pairs']:,} pooled question–chunk pairs were judged by {screened['judge_model']}. Precision and NDCG apply to the judged top-20 lists. Recall is relative to the pooled relevant passages, because passages outside the candidate pool have unknown relevance.",
            "",
            "Configuration names are `normalization|embedder or bm25|retrieval`; a trailing `|dimension` restricts candidates to the question's impact dimension.",
            "",
            "| Configuration | Precision@5 | Precision@20 | Pool recall@20 | NDCG@10 | NDCG@20 | MAP@20 | Hit@10 | MRR |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
        ])
        for row in sorted(full_rows, key=lambda item: -item["ndcg10"]):
            name = row["configuration"].replace("|", "\\|")
            lines.append(f"| {name} | {format_number(row['precision5'])} | "
                         f"{format_number(row['precision20'])} | {format_number(row['pool_recall20'])} | "
                         f"{format_number(row['ndcg10'])} | {format_number(row['ndcg20'])} | "
                         f"{format_number(row['map20'])} | {format_number(row['hit10'])} | "
                         f"{format_number(row['mrr'])} |")
        lines.extend(["", "[All screened configurations](screened_metrics.csv) · "
                      "[Every judged question–chunk pair](question_pairs.csv)", ""])

    corrupted, garbled_total = corrupted_documents()
    if corrupted:
        lines.extend([
            "## Data quality",
            "",
            "These accepted PDFs have broken font encodings: their text layers extract as glyph codes instead of words, which neither the PDF screen nor the application's OCR check detected. They remain in this benchmark, so every configuration sees the same corpus; replace them in the dataset before reuse.",
            "",
            "| Document | Garbled chunks | Chunks |",
            "| --- | ---: | ---: |",
            *[f"| {name} | {count:,} | {chunks:,} |" for name, count, chunks in corrupted],
            "",
            f"{garbled_total:,} chunks across the whole corpus look garbled. Embedding inputs that exceed a model's context, which only happens for such text, are halved until they fit.",
            "",
        ])

    notes_path = OUTPUT / "interpretation.md"
    if notes_path.exists():
        lines.extend(["## Interpretation", "", notes_path.read_text(encoding="utf-8").strip(), ""])

    lines.extend([
        "## Design notes",
        "",
        "- The controlled 110-document pool and the screened 700-document corpus are different evaluation sets with different judgments; compare configurations within a table, not scores across tables.",
        "- Chunking is fixed at 200 words with 50 words of overlap. The application extracts PDF layout and blocks before chunking.",
        "- Retrieval methods are dense cosine, local Okapi BM25, reciprocal-rank hybrid fusion, and MMR diversity selection. No answer generation or cross-encoder reranking is included.",
        "- Normalization variants are raw, Unicode/whitespace cleanup, and case/diacritic/punctuation folding, applied to both questions and passages.",
        "- Machine judgments can disagree with human assessments. A fully exhaustive recall denominator would require labeling passages beyond the retrieved pools.",
        "",
    ])
    (OUTPUT / "report.md").write_text("\n".join(lines), encoding="utf-8")
    print(OUTPUT / "report.md")


if __name__ == "__main__":
    main()
