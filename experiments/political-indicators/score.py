"""Score indicator experiment results against answer-key.json.

Usage: python score.py [variant ...]   (default: every folder under results/)
Writes results/summary.md and prints the same table.
"""

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
KEY = json.loads((HERE / "answer-key.json").read_text(encoding="utf-8"))
RESULTS = HERE / "results"


def lower(text):
    return (text or "").lower()


def doc_indicator_text(indicator):
    return lower(" ".join([indicator["name"], indicator["value"], indicator["evidence"]["quote"]]))


def score_case(result, key):
    stats = {
        "gate_correct": 0, "gate_total": 0,
        "doc_expected": 0, "doc_found": 0, "doc_horizon_ok": 0, "doc_listed": 0, "doc_ungrounded": 0,
        "value_expected": 0, "value_correct": 0, "value_reported": 0,
        "absent_expected": 0, "absent_ok": 0,
        "answers": 0, "grounding_failed": 0,
        "basis": {"reported": 0, "inferred": 0, "unknown": 0},
        "flags": [],
    }
    categories = {c["categoryId"]: c for c in result.get("categories", [])}

    for category_id, expected in key["expectedGated"].items():
        if expected is None:
            continue
        stats["gate_total"] += 1
        stats["gate_correct"] += int((category_id in categories) == expected)
        if (category_id in categories) != expected:
            stats["flags"].append(f"gate {category_id}: expected {expected}")

    for category_id, category in categories.items():
        discovered = [i for h in category["horizons"] for i in h["documentIndicators"]]
        stats["doc_listed"] += len(discovered)
        stats["doc_ungrounded"] += category.get("ungroundedDocumentIndicators", 0)
        for group in key["documentIndicators"].get(category_id, []):
            stats["doc_expected"] += 1
            hits = [i for i in discovered if all(k.lower() in doc_indicator_text(i) for k in group["keywords"])]
            if hits:
                stats["doc_found"] += 1
                stats["doc_horizon_ok"] += int(any(i["horizon"] == group["horizon"] for i in hits))

        for horizon in category["horizons"]:
            for answer in horizon["answers"]:
                indicator_id = answer["indicator"]["id"]
                stats["answers"] += 1
                stats["basis"][answer["basis"]] += 1
                stats["grounding_failed"] += int(answer["groundingFailed"])
                expected = key["answers"].get(indicator_id)
                if not expected or expected["expect"] == "skip":
                    continue
                text = lower(answer["answer"])
                if expected["expect"] == "value":
                    stats["value_expected"] += 1
                    correct = any(a.lower() in text for a in expected["accept"])
                    stats["value_correct"] += int(correct)
                    stats["value_reported"] += int(correct and answer["basis"] == "reported")
                    if not correct:
                        stats["flags"].append(f"miss {indicator_id} [{answer['basis']}]: {answer['answer']}")
                else:
                    stats["absent_expected"] += 1
                    states_absence = bool(re.search(r"\b(no|not|none|n/a|unknown)\b", text))
                    invented = answer["basis"] == "reported" or (
                        bool(re.search(r"\d", text)) and not states_absence
                    ) or text.strip() in ("yes", "yes.")
                    stats["absent_ok"] += int(not invented)
                    if invented:
                        stats["flags"].append(f"invent {indicator_id} [{answer['basis']}/{answer['confidence']}]: {answer['answer']}")
    return stats


def merge(total, stats):
    for name, value in stats.items():
        if name == "basis":
            for basis, count in value.items():
                total["basis"][basis] += count
        elif name == "flags":
            total["flags"].extend(value)
        else:
            total[name] = total.get(name, 0) + value


def pct(numerator, denominator):
    return f"{numerator}/{denominator}" + (f" ({100 * numerator / denominator:.0f}%)" if denominator else "")


def main():
    variants = sys.argv[1:] or sorted(p.name for p in RESULTS.iterdir() if p.is_dir())
    lines = [
        "| Variant | Gate | Doc indicators found | Horizon right | Listed / ungrounded | Values right | Absent handled | Basis R/I/U | Grounding failed | Seconds |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    details = []
    for variant in variants:
        total = {"basis": {"reported": 0, "inferred": 0, "unknown": 0}, "flags": []}
        seconds = 0.0
        errors = []
        for path in sorted(p for p in (RESULTS / variant).glob("*.json") if not p.name.endswith(".raw.json")):
            result = json.loads(path.read_text(encoding="utf-8"))
            seconds += result.get("seconds", 0)
            if "error" in result:
                errors.append(f"{result['file']}: {result['error']}")
                continue
            key = KEY.get(result["file"])
            if not key:
                continue
            stats = score_case(result, key)
            stats["flags"] = [f"{result['file']}: {flag}" for flag in stats["flags"]]
            merge(total, stats)
        b = total["basis"]
        lines.append(
            f"| {variant} | {pct(total.get('gate_correct', 0), total.get('gate_total', 0))} "
            f"| {pct(total.get('doc_found', 0), total.get('doc_expected', 0))} "
            f"| {pct(total.get('doc_horizon_ok', 0), total.get('doc_found', 0))} "
            f"| {total.get('doc_listed', 0)} / {total.get('doc_ungrounded', 0)} "
            f"| {pct(total.get('value_correct', 0), total.get('value_expected', 0))} "
            f"| {pct(total.get('absent_ok', 0), total.get('absent_expected', 0))} "
            f"| {b['reported']}/{b['inferred']}/{b['unknown']} "
            f"| {total.get('grounding_failed', 0)} | {seconds:.0f} |"
        )
        details.append(f"\n### {variant}\n" + "\n".join(f"- {f}" for f in errors + total["flags"]))
    report = "\n".join(lines) + "\n" + "\n".join(details) + "\n"
    (RESULTS / "summary.md").write_text(report, encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
