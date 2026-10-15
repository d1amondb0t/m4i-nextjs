#!/usr/bin/env python3
"""
Downloads 100 text-extractable PDFs for each impact dimension into
./dataset/{dimension}/raw/. PDFs needing OCR are excluded entirely.

    python scripts/build_dataset.py

Files are named {dimension}-1.pdf ... {dimension}-100.pdf, and the source URL of
each one is recorded in ./dataset/{dimension}/links.json. Re-running resumes.
"""

import csv
import hashlib
import io
import json
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from itertools import islice
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PER_DIMENSION = 100
MAX_CANDIDATES = 1000  # give up on a dimension after trying this many links
RETRIES = 3
WORKERS = 4  # parallel downloads per dimension; dimensions also run in parallel
DATASET = Path(__file__).resolve().parent.parent / "dataset"
CONTACT = "goofythegoofster@gmail.com"
USER_AGENT = f"m4i-dataset/0.1 (research corpus builder; {CONTACT})"
OCR_CHECKER = Path(__file__).with_name("check_pdf_ocr.mjs")
SCREEN_VERSION = 3
APP_CORPUS = DATASET.parent / "calibration" / "results" / "screened-corpus"


def screen_pdf(pdf):
    """Check every page for extractable text, without invoking OCR."""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as temporary:
        temporary.write(pdf)
        temporary_path = Path(temporary.name)
    try:
        try:
            result = subprocess.run(
                ["node", str(OCR_CHECKER), str(temporary_path)],
                capture_output=True, text=True, timeout=180, check=False,
            )
        except (subprocess.TimeoutExpired, OSError) as error:
            return f"OCR screening failed: {error}"
    finally:
        temporary_path.unlink(missing_ok=True)
    try:
        verdict = json.loads(result.stdout.strip().splitlines()[-1])
    except (IndexError, ValueError):
        return f"OCR screening failed: {result.stderr.strip() or result.stdout.strip()}"
    return None if verdict.get("ok") else (
        f"page {verdict['page']}: {verdict['reason']}" if verdict.get("page")
        else verdict.get("reason", "OCR required")
    )


def write_json(path, data):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    for attempt in range(6):
        try:
            temporary.replace(path)
            return
        except PermissionError:
            if attempt == 5:
                raise
            time.sleep(0.1 * 2**attempt)


def audit_existing(dimension, raw, links_path, links, rejected_path, rejected):
    """Quarantine old OCR PDFs and renumber survivors before downloading more."""
    entries = [(link, raw / link["file"]) for link in links if (raw / link["file"]).exists()]
    manifest_path = APP_CORPUS / "manifest.json"
    app_failures = {}
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for failure in manifest.get("failures", []):
            filename = failure.split(":", 1)[0]
            if filename.startswith(f"{dimension}-"):
                cache_path = APP_CORPUS / f"{filename}.json"
                if cache_path.exists():
                    cached = json.loads(cache_path.read_text(encoding="utf-8"))
                    app_failures[filename] = (cached.get("sourceHash"), failure)

    def check(entry):
        link, path = entry
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        app_failure = app_failures.get(path.name)
        if app_failure and app_failure[0] == digest:
            return f"application extractor: {app_failure[1]}"
        if link.get("sha256") == digest and link.get("ocr_screened_version") == SCREEN_VERSION:
            return None
        return screen_pdf(path.read_bytes())
    with ThreadPoolExecutor(WORKERS) as pool:
        checks = list(pool.map(check, entries))
    kept = []
    quarantine = raw.parent / "rejected"
    for (link, path), reason in zip(entries, checks):
        if reason:
            quarantine.mkdir(exist_ok=True)
            destination = quarantine / path.name
            if destination.exists():
                destination = quarantine / f"{path.stem}-{hashlib.sha256(path.read_bytes()).hexdigest()[:8]}.pdf"
            path.replace(destination)
            rejected.append({"file": destination.name, "url": link["url"], "reason": reason})
            print(f"  [{dimension}] OCR skip {path.name}: {reason}", flush=True)
        else:
            kept.append({**link, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                         "ocr_screened": True, "ocr_screened_version": SCREEN_VERSION})
    # Use temporary names so renumbering cannot overwrite an existing PDF.
    staged = []
    for index, link in enumerate(kept, 1):
        old = raw / link["file"]
        temporary = raw / f".accepted-{index}.pdf"
        old.replace(temporary)
        staged.append((link, temporary, f"{dimension}-{index}.pdf"))
    for link, temporary, filename in staged:
        temporary.replace(raw / filename)
        link["file"] = filename
    write_json(links_path, kept)
    write_json(rejected_path, rejected)
    return kept


def recover_false_ocr_rejections(dimension, raw, links, rejected_path, rejected):
    """Recheck quarantined files after a screening-rule update."""
    remaining = []
    for item in rejected:
        if (len(links) >= PER_DIMENSION or "file" not in item or
                "probable joined words" not in item["reason"]):
            remaining.append(item)
            continue
        path = raw.parent / "rejected" / item["file"]
        if not path.exists() or screen_pdf(path.read_bytes()):
            remaining.append(item)
            continue
        filename = f"{dimension}-{len(links) + 1}.pdf"
        path.replace(raw / filename)
        links.append({
            "file": filename, "url": item["url"],
            "sha256": hashlib.sha256((raw / filename).read_bytes()).hexdigest(),
            "ocr_screened": True, "ocr_screened_version": SCREEN_VERSION,
        })
        print(f"  [{dimension}] restored readable {filename}", flush=True)
    write_json(rejected_path, remaining)
    return links, remaining


def get(url, timeout=60):
    """GET with a few retries; raises the last error if every attempt fails."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})

    for attempt in range(1, RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except Exception as error:
            client_error = isinstance(error, urllib.error.HTTPError) and error.code < 500 and error.code != 429
            if client_error or attempt == RETRIES:  # a 403/404 won't fix itself, so don't retry it
                raise
            time.sleep(2**attempt)


def get_json(url):
    return json.loads(get(url))


# --- sources: each yields PDF URLs, paging until its listing runs out ---------


def every_crs_report():
    text = get("https://www.everycrsreport.com/reports.csv").decode("utf-8", "replace")
    for row in csv.DictReader(io.StringIO(text)):
        if row.get("latestPDF"):
            yield f"https://www.everycrsreport.com/{row['latestPDF']}"


def world_bank(term):
    for offset in range(0, 10_000, 50):
        query = urllib.parse.urlencode({"format": "json", "fl": "pdfurl", "rows": 50, "os": offset, "qterm": term})
        docs = get_json(f"https://search.worldbank.org/api/v3/wds?{query}").get("documents", {})
        docs = [doc for key, doc in docs.items() if key != "facets"]
        if not docs:
            return
        yield from (doc["pdfurl"] for doc in docs if doc.get("pdfurl"))


def open_alex(search):
    cursor = "*"
    while cursor:
        oa_filter = "is_oa:true,type:article,locations.source.type:repository"
        params = {"filter": oa_filter, "search": search, "per-page": 100, "cursor": cursor, "mailto": CONTACT}
        query = urllib.parse.urlencode(params)
        payload = get_json(f"https://api.openalex.org/works?{query}")
        if not payload.get("results"):
            return
        for work in payload["results"]:
            pdf = (work.get("best_oa_location") or {}).get("pdf_url")
            if pdf:
                yield pdf
        cursor = payload.get("meta", {}).get("next_cursor")


def eric(subject):
    search = f'(subject:"{subject}") AND (e_fulltextauth:1)'
    for start in range(0, 10_000, 200):
        query = urllib.parse.urlencode({"format": "json", "fields": "id", "rows": 200, "start": start, "search": search})
        docs = get_json(f"https://api.ies.ed.gov/eric/?{query}").get("response", {}).get("docs", [])
        if not docs:
            return
        for doc in docs:
            if doc.get("id", "").startswith("ED"):  # only ED* records are hosted as PDF by ERIC
                yield f"https://files.eric.ed.gov/fulltext/{doc['id']}.pdf"


DIMENSIONS = {
    "political": [every_crs_report()],
    "economic": [world_bank(t) for t in ["fiscal policy reform", "employment and labor markets", "financial inclusion"]],
    "social": [
        open_alex(s) for s in ["social protection impact evaluation", "health equity outcomes", "access to basic services"]
    ],
    "environmental": [
        world_bank(t)
        for t in ["climate change mitigation", "climate adaptation resilience", "biodiversity and natural resources"]
    ],
    # ROSA P, the preferred transport source, blocks automated access (HTTP 403).
    "urban_transport": [world_bank(t) for t in ["urban transport", "road and rail infrastructure", "urban planning"]],
    "humanitarian_rights": [
        open_alex(s)
        for s in ["humanitarian response evaluation", "international humanitarian law", "refugee protection rights"]
    ],
    "education": [eric(s) for s in ["Educational Policy", "Academic Achievement", "Teacher Effectiveness"]],
}


def candidates(sources, seen):
    """Takes one new URL from each source in turn; drops a source when it ends or errors."""
    while sources:
        for source in list(sources):
            try:
                url = next(source)
            except StopIteration:
                sources.remove(source)
                continue
            except Exception as error:
                print(f"  ! source failed, skipping it: {error}")
                sources.remove(source)
                continue
            if url not in seen:
                seen.add(url)
                yield url


def fetch(url):
    """Returns (url, pdf bytes, None) or (url, None, reason it was skipped)."""
    try:
        pdf = get(url, timeout=120)
    except Exception as error:
        return url, None, error
    if not pdf.startswith(b"%PDF-") or len(pdf) < 10_000:
        return url, None, "not a PDF"
    reason = screen_pdf(pdf)
    if reason:
        return url, None, f"OCR required or unreadable: {reason}"
    return url, pdf, None


def download(dimension, sources):
    """Downloads until PER_DIMENSION PDFs exist; returns an error message if it falls short."""
    raw = DATASET / dimension / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    links_path = DATASET / dimension / "links.json"
    links = json.loads(links_path.read_text()) if links_path.exists() else []
    rejected_path = DATASET / dimension / "rejected.json"
    rejected = json.loads(rejected_path.read_text()) if rejected_path.exists() else []
    links, rejected = recover_false_ocr_rejections(
        dimension, raw, links, rejected_path, rejected
    )
    links = audit_existing(dimension, raw, links_path, links, rejected_path, rejected)
    urls = candidates(sources, seen={link["url"] for link in links + rejected})
    hashes = {link["sha256"] for link in links}
    tried = 0

    with ThreadPoolExecutor(WORKERS) as pool:
        while len(links) < PER_DIMENSION:
            if tried >= MAX_CANDIDATES:
                return f"gave up after trying {MAX_CANDIDATES} links ({len(links)}/{PER_DIMENSION} saved)"
            batch = list(islice(urls, WORKERS))
            if not batch:
                return f"sources ran out ({len(links)}/{PER_DIMENSION} saved)"
            tried += len(batch)

            for url, pdf, error in pool.map(fetch, batch):
                if error:
                    print(f"  [{dimension}] skip {url}: {error}")
                    rejected.append({"url": url, "reason": str(error)})
                    write_json(rejected_path, rejected)
                    continue
                digest = hashlib.sha256(pdf).hexdigest()
                if digest in hashes:
                    print(f"  [{dimension}] skip duplicate PDF: {url}")
                    rejected.append({"url": url, "reason": "duplicate PDF"})
                    write_json(rejected_path, rejected)
                    continue
                if len(links) >= PER_DIMENSION:
                    break
                # Files are numbered and saved here, on one thread, so numbering stays in order.
                filename = f"{dimension}-{len(links) + 1}.pdf"
                (raw / filename).write_bytes(pdf)
                links.append({"file": filename, "url": url, "sha256": digest,
                              "ocr_screened": True, "ocr_screened_version": SCREEN_VERSION})
                hashes.add(digest)
                write_json(links_path, links)
                print(f"[{dimension}] {len(links)}/{PER_DIMENSION} {filename} <- {url}")


def main():
    if not DATASET.exists():
        DATASET.mkdir()
        print(f"Created {DATASET}")

    with ThreadPoolExecutor(len(DIMENSIONS)) as pool:
        results = dict(zip(DIMENSIONS, pool.map(lambda item: download(*item), DIMENSIONS.items())))

    print("\nDone.")
    errors = {dimension: error for dimension, error in results.items() if error}
    for dimension, error in errors.items():
        print(f"  ERROR {dimension}: {error}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
