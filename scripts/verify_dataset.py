#!/usr/bin/env python3
"""Verify the OCR-screened PDF corpus and default-chunk export."""

import hashlib
import json
from collections import Counter
from pathlib import Path

from build_dataset import DATASET, DIMENSIONS, PER_DIMENSION, SCREEN_VERSION

CORPUS = DATASET.parent / "calibration" / "results" / "screened-corpus"


def main():
    hashes = set()
    chunk_ids = set()
    counts = Counter()
    for dimension in DIMENSIONS:
        raw = DATASET / dimension / "raw"
        links = json.loads((raw.parent / "links.json").read_text(encoding="utf-8"))
        assert len(links) == PER_DIMENSION, (dimension, len(links))
        assert len(list(raw.glob("*.pdf"))) == PER_DIMENSION, dimension
        for number, link in enumerate(links, 1):
            name = f"{dimension}-{number}.pdf"
            assert link["file"] == name, link
            assert link.get("ocr_screened_version") == SCREEN_VERSION, name
            digest = hashlib.sha256((raw / name).read_bytes()).hexdigest()
            assert digest == link["sha256"] and digest not in hashes, name
            hashes.add(digest)
            exported = json.loads((CORPUS / f"{name}.json").read_text(encoding="utf-8"))
            assert exported["sourceHash"] == digest, name
            assert exported.get("exportVersion") == 2, name
            chunks = exported["chunks"]
            assert chunks, name
            assert all(c["metadata"].get("extractionQuality") != "ocr" and
                       not c["metadata"].get("quarantinedPages") for c in chunks), name
            ids = {chunk["chunkId"] for chunk in chunks}
            assert len(ids) == len(chunks) and not (ids & chunk_ids), name
            chunk_ids.update(ids)
            counts[dimension] += len(chunks)
    manifest = json.loads((CORPUS / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["documents"] == 700 and not manifest["failures"], manifest
    assert sum(counts.values()) == manifest["chunks"], counts
    report = {"documents": 700, "unique_sha256": len(hashes),
              "chunks": sum(counts.values()), "chunks_by_dimension": dict(counts),
              "ocr_or_quarantined_documents": 0}
    (CORPUS / "verification.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
