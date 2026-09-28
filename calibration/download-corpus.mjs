/**
 * Downloads a topically-balanced calibration corpus from the public sources
 * catalogued in docs/calibration-corpus-sources.md.
 *
 *   node calibration/download-corpus.mjs --per-topic 20
 *   node calibration/download-corpus.mjs --per-topic 5 --topics education,social
 *
 * Politeness follows the practical notes in the source document: capped
 * concurrency, a descriptive User-Agent with a contact address, and dedupe by
 * content hash rather than URL. Files larger than the upload policy's 25 MB
 * limit are skipped so every downloaded document can actually enter the
 * pipeline.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const CONTACT = "goofythegoofster@gmail.com";
const USER_AGENT = `m4i-calibration/0.1 (research corpus builder; ${CONTACT})`;
const MAX_BYTES = 25 * 1024 * 1024; // matches MAX_DOCUMENT_SIZE_BYTES
const MIN_BYTES = 10 * 1024; // below this it is almost always an error page
const DOWNLOAD_CONCURRENCY = 3;
const METADATA_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;

function parseArgs(argv) {
  const args = { perTopic: 20, topics: null, out: join(HERE, "corpus") };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];

    if (flag === "--per-topic") args.perTopic = Number(argv[index + 1]);
    else if (flag === "--topics") args.topics = argv[index + 1].split(",").map((t) => t.trim());
    else if (flag === "--out") args.out = resolve(argv[index + 1]);
  }

  if (!Number.isSafeInteger(args.perTopic) || args.perTopic <= 0) {
    throw new Error("--per-topic must be a positive integer.");
  }

  return args;
}

async function request(url, { timeout = METADATA_TIMEOUT_MS, accept = "*/*" } = {}) {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept },
    signal: AbortSignal.timeout(timeout),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }

  return response;
}

async function getJson(url) {
  return (await request(url, { accept: "application/json" })).json();
}

async function getText(url) {
  return (await request(url, { accept: "text/plain,text/csv,application/xml,text/xml" })).text();
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Naive CSV row splitter that honours double-quoted fields. */
function splitCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }

  cells.push(cell);
  return cells;
}

function tagValues(xml, tag) {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  return [...xml.matchAll(pattern)].map((match) =>
    match[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim(),
  );
}

// --- source adapters -------------------------------------------------------
// Each adapter returns candidate records: { id, title, url, source }.
// Adapters over-fetch, because not every candidate resolves to a usable PDF.

/** Politics — EveryCRSReport bulk index (US public domain). */
async function everyCrsReport(limit) {
  const csv = await getText("https://www.everycrsreport.com/reports.csv");
  const lines = csv.split("\n").filter((line) => line.trim());
  const header = splitCsvLine(lines[0]);
  const numberAt = header.indexOf("number");
  const titleAt = header.indexOf("title");
  const pdfAt = header.indexOf("latestPDF");
  const records = [];

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const pdf = cells[pdfAt];

    if (!pdf) continue;

    records.push({
      id: cells[numberAt],
      title: cells[titleAt],
      url: `https://www.everycrsreport.com/${pdf}`,
      source: "EveryCRSReport",
    });

    if (records.length >= limit) break;
  }

  return records;
}

/** Economy + Environment — World Bank Documents & Reports API (CC-BY 3.0 IGO). */
function worldBank(terms, sourceLabel) {
  return async (limit) => {
    const perTerm = Math.ceil(limit / terms.length);
    const records = [];

    for (const term of terms) {
      const url =
        "https://search.worldbank.org/api/v3/wds?format=json&fl=docdt,display_title,pdfurl" +
        `&rows=${perTerm}&os=0&qterm=${encodeURIComponent(term)}`;
      const payload = await getJson(url);

      for (const [key, document] of Object.entries(payload.documents ?? {})) {
        if (key === "facets" || !document?.pdfurl) continue;

        records.push({
          id: document.id ?? key,
          title: document.display_title ?? key,
          url: document.pdfurl,
          source: sourceLabel,
        });
      }

      await sleep(400);
    }

    return records.slice(0, limit);
  };
}

/** Social + Humanitarian — OpenAlex open-access PDFs (CC0 metadata). */
function openAlex(searches, sourceLabel) {
  return async (limit) => {
    const perSearch = Math.ceil(limit / searches.length);
    const records = [];

    for (const search of searches) {
      const url =
        "https://api.openalex.org/works?filter=is_oa:true,type:article,locations.source.type:repository" +
        `&search=${encodeURIComponent(search)}&per-page=${Math.min(perSearch, 100)}` +
        `&mailto=${encodeURIComponent(CONTACT)}`;
      const payload = await getJson(url);

      for (const work of payload.results ?? []) {
        const pdf = work.best_oa_location?.pdf_url ?? work.primary_location?.pdf_url;

        if (!pdf) continue;

        records.push({
          id: (work.id ?? "").split("/").pop(),
          title: work.display_name ?? "untitled",
          url: pdf,
          source: sourceLabel,
        });
      }

      await sleep(400);
    }

    return records.slice(0, limit);
  };
}

/** Urban & transport — ROSA P OAI-PMH (US public domain). */
async function rosaP(limit) {
  const records = [];
  let token = null;

  while (records.length < limit) {
    const url = token
      ? `https://rosap.ntl.bts.gov/fedora/oai?verb=ListRecords&resumptionToken=${encodeURIComponent(token)}`
      : "https://rosap.ntl.bts.gov/fedora/oai?verb=ListRecords&metadataPrefix=oai_dc";
    const xml = await getText(url);
    const blocks = xml.split("<record>").slice(1);

    for (const block of blocks) {
      const format = tagValues(block, "dc:format")[0];
      const view = tagValues(block, "dc:identifier").find((value) =>
        /rosap\.ntl\.bts\.gov\/view\/dot\/\d+/.test(value),
      );

      if (!view || (format && !/pdf/i.test(format))) continue;

      const id = view.match(/\/view\/dot\/(\d+)/)?.[1];

      if (!id) continue;

      records.push({
        id: `dot-${id}`,
        title: tagValues(block, "dc:title")[0] ?? `dot-${id}`,
        url: `https://rosap.ntl.bts.gov/view/dot/${id}/dot_${id}_DS1.pdf`,
        source: "ROSA P (National Transportation Library)",
      });

      if (records.length >= limit) break;
    }

    token = tagValues(xml, "resumptionToken")[0];

    if (!token) break;

    await sleep(500);
  }

  return records;
}

/** Education — ERIC. Only ED* accessions are hosted as PDF by ERIC itself. */
function eric(subjects) {
  return async (limit) => {
    const perSubject = Math.ceil(limit / subjects.length);
    const records = [];

    for (const subject of subjects) {
      const search = `(subject:"${subject}") AND (e_fulltextauth:1)`;
      const url =
        "https://api.ies.ed.gov/eric/?format=json&fields=id,title" +
        `&rows=${Math.min(perSubject * 3, 200)}&search=${encodeURIComponent(search)}`;
      const payload = await getJson(url);
      let taken = 0;

      for (const document of payload.response?.docs ?? []) {
        if (!document.id?.startsWith("ED") || taken >= perSubject) continue;

        records.push({
          id: document.id,
          title: document.title ?? document.id,
          url: `https://files.eric.ed.gov/fulltext/${document.id}.pdf`,
          source: "ERIC (IES)",
        });
        taken += 1;
      }

      await sleep(400);
    }

    return records.slice(0, limit);
  };
}

/**
 * One topic per impact dimension in calibration/ontology.json.
 *
 * ReliefWeb (the document's first pick for humanitarian) rejects unapproved
 * `appname` values with HTTP 403, and the SSOAR OAI endpoint returns 404 on
 * every documented path, so both buckets fall back to OpenAlex open access.
 */
const TOPICS = {
  political: {
    dimension: "political",
    fetch: everyCrsReport,
    note: "EveryCRSReport bulk index",
  },
  economic: {
    dimension: "economic",
    fetch: worldBank(
      ["fiscal policy reform", "employment and labor markets", "financial inclusion"],
      "World Bank Documents & Reports",
    ),
    note: "World Bank D&R API",
  },
  social: {
    dimension: "social",
    fetch: openAlex(
      ["social protection impact evaluation", "health equity outcomes", "access to basic services"],
      "OpenAlex (open access)",
    ),
    note: "OpenAlex — substitutes for SSOAR, whose OAI endpoint is unavailable",
  },
  environmental: {
    dimension: "environmental",
    fetch: worldBank(
      ["climate change mitigation", "climate adaptation resilience", "biodiversity and natural resources"],
      "World Bank Documents & Reports",
    ),
    note: "World Bank D&R API, climate and environment terms",
  },
  urban_transport: {
    dimension: "urban_transport",
    fetch: rosaP,
    note: "ROSA P OAI-PMH",
  },
  humanitarian_rights: {
    dimension: "humanitarian_rights",
    fetch: openAlex(
      ["humanitarian response evaluation", "international humanitarian law compliance", "refugee protection rights"],
      "OpenAlex (open access)",
    ),
    note: "OpenAlex — substitutes for ReliefWeb, which requires an approved appname",
  },
  education: {
    dimension: "education",
    fetch: eric([
      "Educational Policy",
      "Academic Achievement",
      "Teacher Effectiveness",
    ]),
    note: "ERIC API, ERIC-hosted full text only",
  },
};

function safeName(topic, id) {
  return `${topic}__${String(id).replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80)}.pdf`;
}

async function downloadOne(record, topic, outDir, seenHashes) {
  const response = await fetch(record.url, {
    headers: { "user-agent": USER_AGENT, accept: "application/pdf,*/*" },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    redirect: "follow",
  });

  if (!response.ok) {
    return { status: "skipped", reason: `http ${response.status}` };
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length < MIN_BYTES) return { status: "skipped", reason: "too small" };
  if (buffer.length > MAX_BYTES) return { status: "skipped", reason: "over 25 MB" };
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return { status: "skipped", reason: "not a PDF" };
  }

  // Dedupe by content hash, not URL: several providers republish the same file.
  const hash = createHash("sha256").update(buffer).digest("hex");

  if (seenHashes.has(hash)) return { status: "skipped", reason: "duplicate content" };
  seenHashes.add(hash);

  const filename = safeName(topic, record.id);
  await writeFile(join(outDir, filename), buffer);

  return { status: "downloaded", filename, bytes: buffer.length, sha256: hash };
}

async function runPool(items, worker, concurrency) {
  const results = [];
  let cursor = 0;

  async function next() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const topicNames = args.topics ?? Object.keys(TOPICS);
  const manifestPath = join(args.out, "manifest.json");
  const manifest = existsSync(manifestPath)
    ? JSON.parse(await readFile(manifestPath, "utf8"))
    : { createdAt: new Date().toISOString(), documents: [] };
  const seenHashes = new Set(manifest.documents.map((entry) => entry.sha256));

  for (const topic of topicNames) {
    const definition = TOPICS[topic];

    if (!definition) throw new Error(`Unknown topic "${topic}".`);

    const outDir = join(args.out, topic);
    await mkdir(outDir, { recursive: true });

    process.stdout.write(`\n[${topic}] listing candidates (${definition.note})\n`);

    let candidates;

    try {
      // Over-fetch: many candidates 404 or are not really PDFs.
      candidates = await definition.fetch(args.perTopic * 3);
    } catch (error) {
      process.stdout.write(`[${topic}] LISTING FAILED: ${error.message}\n`);
      continue;
    }

    process.stdout.write(`[${topic}] ${candidates.length} candidates, target ${args.perTopic}\n`);

    let kept = 0;
    const outcomes = await runPool(
      candidates,
      async (record) => {
        if (kept >= args.perTopic) return { status: "skipped", reason: "target reached" };

        try {
          const outcome = await downloadOne(record, topic, outDir, seenHashes);

          if (outcome.status === "downloaded") {
            kept += 1;
            manifest.documents.push({
              topic,
              dimension: definition.dimension,
              sourceCollection: record.source,
              sourceId: record.id,
              title: record.title,
              url: record.url,
              file: `${topic}/${outcome.filename}`,
              bytes: outcome.bytes,
              sha256: outcome.sha256,
            });
          }

          return outcome;
        } catch (error) {
          return { status: "skipped", reason: error.message.slice(0, 80) };
        }
      },
      DOWNLOAD_CONCURRENCY,
    );

    const failures = outcomes.filter((o) => o.status === "skipped" && o.reason !== "target reached");
    process.stdout.write(`[${topic}] downloaded ${kept}, skipped ${failures.length}\n`);

    const reasons = {};
    for (const failure of failures) reasons[failure.reason] = (reasons[failure.reason] ?? 0) + 1;
    for (const [reason, count] of Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      process.stdout.write(`         ${count}x ${reason}\n`);
    }
  }

  manifest.updatedAt = new Date().toISOString();
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const byTopic = {};
  for (const entry of manifest.documents) byTopic[entry.topic] = (byTopic[entry.topic] ?? 0) + 1;

  process.stdout.write(`\nManifest: ${manifestPath}\n`);
  process.stdout.write(`Total documents: ${manifest.documents.length}\n`);
  for (const [topic, count] of Object.entries(byTopic)) {
    process.stdout.write(`  ${topic.padEnd(22)} ${count}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
