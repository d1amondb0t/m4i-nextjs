// Compares benchmark_ontology_batching variants against a reference variant.
// Usage: node scripts/compare_ontology_batching.mjs baseline variant-a variant-b
// Writes calibration/results/ontology-batching/comparison.json and prints a summary.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../calibration/results/ontology-batching");
const [reference, ...variants] = process.argv.slice(2);
const TRUNCATION_TOKENS = 4096;

const load = (variant) =>
  Object.fromEntries(
    readdirSync(path.join(root, variant))
      .filter((name) => name.endsWith(".json"))
      .map((name) => [name, JSON.parse(readFileSync(path.join(root, variant, name), "utf8"))]),
  );

const normalize = (text) => text.replace(/\s+/g, " ").trim().toLowerCase();
const matchKey = (match) => `${match.question}|${match.chunkId}|${normalize(match.quote)}`;
const passageKey = (match) => `${match.question}|${match.chunkId}`;

function questionChunks(report) {
  const map = new Map();
  for (const category of report.diagnostics) {
    for (const question of category.questions) {
      map.set(`${category.categoryId}|${question.question}`, question.chunks);
    }
  }
  return map;
}

function overlap(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  const shared = [...a].filter((key) => b.has(key)).length;
  return { shared, onlyReference: a.size - shared, onlyVariant: b.size - shared };
}

function compareRetrieval(referenceReport, variantReport) {
  const referenceChunks = questionChunks(referenceReport);
  const variantChunks = questionChunks(variantReport);
  let identicalQuestions = 0;
  let jaccardSum = 0;
  let maxScoreDifference = 0;
  for (const [key, chunks] of referenceChunks) {
    const other = variantChunks.get(key) ?? [];
    const ids = chunks.map((chunk) => chunk.chunkId);
    const otherIds = other.map((chunk) => chunk.chunkId);
    const { shared, onlyReference, onlyVariant } = overlap(ids, otherIds);
    const union = shared + onlyReference + onlyVariant;
    jaccardSum += union === 0 ? 1 : shared / union;
    if (onlyReference === 0 && onlyVariant === 0 && ids.join() === otherIds.join()) identicalQuestions += 1;
    const otherScores = new Map(other.map((chunk) => [chunk.chunkId, chunk.scores.rerankerScore]));
    for (const chunk of chunks) {
      if (otherScores.has(chunk.chunkId)) {
        maxScoreDifference = Math.max(
          maxScoreDifference,
          Math.abs(chunk.scores.rerankerScore - otherScores.get(chunk.chunkId)),
        );
      }
    }
  }
  return {
    questions: referenceChunks.size,
    identicalChunkLists: identicalQuestions,
    meanJaccard: jaccardSum / referenceChunks.size,
    maxRerankerScoreDifference: maxScoreDifference,
  };
}

function compareMatches(referenceReport, variantReport) {
  return {
    referenceMatches: referenceReport.matches.length,
    variantMatches: variantReport.matches.length,
    exact: overlap(referenceReport.matches.map(matchKey), variantReport.matches.map(matchKey)),
    sameQuestionAndChunk: overlap(
      referenceReport.matches.map(passageKey),
      variantReport.matches.map(passageKey),
    ),
    rejected: {
      reference: referenceReport.diagnostics.reduce((n, c) => n + c.rejected.length, 0),
      variant: variantReport.diagnostics.reduce((n, c) => n + c.rejected.length, 0),
    },
  };
}

function timing(report) {
  const analyzer = report.ollama.analyzer;
  return {
    totalS: report.timingsMs.total / 1000,
    retrievalS: report.timingsMs.retrieval / 1000,
    analysisS: report.timingsMs.analysis / 1000,
    rerankCalls: report.ollama.rerank.calls,
    analyzerCalls: analyzer.calls,
    analyzerPromptTokens: analyzer.promptTokens,
    analyzerMaxPromptTokens: analyzer.maxPromptTokens,
    analyzerEvalTokens: analyzer.evalTokens,
    truncatedAnalyzerCalls: report.analyzerCalls.filter(
      (call) => (call.numCtx ?? TRUNCATION_TOKENS) <= TRUNCATION_TOKENS && call.promptTokens >= TRUNCATION_TOKENS - 8,
    ).length,
  };
}

const referenceReports = load(reference);
const output = { reference, documents: {}, totals: {} };

for (const [name, report] of Object.entries(referenceReports)) {
  output.documents[name] = { chunks: report.chunks, [reference]: timing(report) };
}

for (const variant of variants) {
  const reports = load(variant);
  for (const [name, report] of Object.entries(reports)) {
    const referenceReport = referenceReports[name];
    if (!referenceReport) continue;
    output.documents[name][variant] = {
      ...timing(report),
      retrieval: compareRetrieval(referenceReport, report),
      matches: compareMatches(referenceReport, report),
      batchStatistics: report.batchStatistics,
    };
  }
}

for (const variant of [reference, ...variants]) {
  const rows = Object.values(output.documents).filter((row) => row[variant]);
  const total = (field) => rows.reduce((sum, row) => sum + row[variant][field], 0);
  output.totals[variant] = {
    documents: rows.length,
    totalS: total("totalS"),
    retrievalS: total("retrievalS"),
    analysisS: total("analysisS"),
    analyzerCalls: total("analyzerCalls"),
    truncatedAnalyzerCalls: total("truncatedAnalyzerCalls"),
  };
  if (variant !== reference) {
    const sum = (pick) => rows.reduce((n, row) => n + pick(row[variant]), 0);
    Object.assign(output.totals[variant], {
      identicalChunkLists: sum((row) => row.retrieval.identicalChunkLists),
      questions: sum((row) => row.retrieval.questions),
      maxRerankerScoreDifference: Math.max(...rows.map((row) => row[variant].retrieval.maxRerankerScoreDifference)),
      referenceMatches: sum((row) => row.matches.referenceMatches),
      variantMatches: sum((row) => row.matches.variantMatches),
      exactShared: sum((row) => row.matches.exact.shared),
      passageShared: sum((row) => row.matches.sameQuestionAndChunk.shared),
    });
  }
}

writeFileSync(path.join(root, "comparison.json"), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output.totals, null, 2));
