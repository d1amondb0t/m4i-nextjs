#!/usr/bin/env python3
"""
Downloads raw PDFs for each impact dimension into ./dataset/{dimension}/raw/.

    python scripts/build_dataset.py

Files are named {dimension}-1.pdf ... {dimension}-100.pdf, and the source URL of
each one is recorded in ./dataset/{dimension}/links.json. Re-running resumes.
"""

import csv
import io
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from itertools import islice
from pathlib import Path

PER_DIMENSION = 100
MAX_CANDIDATES = 1000  # give up on a dimension after trying this many links
RETRIES = 3
WORKERS = 4  # parallel downloads per dimension; dimensions also run in parallel
DATASET = Path(__file__).resolve().parent.parent / "dataset"
CONTACT = "goofythegoofster@gmail.com"
USER_AGENT = f"m4i-dataset/0.1 (research corpus builder; {CONTACT})"


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
    return url, pdf, None


def download(dimension, sources):
    """Downloads until PER_DIMENSION PDFs exist; returns an error message if it falls short."""
    raw = DATASET / dimension / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    links_path = DATASET / dimension / "links.json"
    links = json.loads(links_path.read_text()) if links_path.exists() else []
    urls = candidates(sources, seen={link["url"] for link in links})
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
                    continue
                if len(links) >= PER_DIMENSION:
                    break
                # Files are numbered and saved here, on one thread, so numbering stays in order.
                filename = f"{dimension}-{len(links) + 1}.pdf"
                (raw / filename).write_bytes(pdf)
                links.append({"file": filename, "url": url})
                links_path.write_text(json.dumps(links, indent=2))
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
