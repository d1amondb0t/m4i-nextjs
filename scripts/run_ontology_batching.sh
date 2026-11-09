#!/usr/bin/env bash
# Runs the ontology batching benchmark variants back to back, restarting Ollama
# with each variant's server settings. Output: calibration/results/ontology-batching/
set -u
cd "$(dirname "$0")/.."
out=calibration/results/ontology-batching
mkdir -p "$out"
small="economic/economic-99.pdf,humanitarian_rights/humanitarian_rights-28.pdf"

run() { # name parallel bench-config analyzer documents
  local name=$1 parallel=$2 config=$3 analyzer=$4 documents=$5
  # The Ollama desktop app restarts its own server on the same port.
  taskkill //F //IM "ollama app.exe" >/dev/null 2>&1
  taskkill //F //IM ollama.exe >/dev/null 2>&1; sleep 3
  OLLAMA_CONTEXT_LENGTH=65536 OLLAMA_NUM_PARALLEL=$parallel ollama serve > "$out/ollama-$name.log" 2>&1 &
  until curl -s localhost:11434/api/version >/dev/null; do sleep 1; done
  if ! grep -q "OLLAMA_NUM_PARALLEL:$parallel" "$out/ollama-$name.log"; then
    echo "$(date +%T) abort $name: Ollama is not running with this script's settings"; exit 1
  fi
  echo "$(date +%T) start $name"
  BENCH_VARIANT=$name BENCH_CONFIG=$config BENCH_ANALYZER=$analyzer BENCH_DOCUMENTS=$documents \
    BENCH_BATCH_CONTEXT_TOKENS=24576 RERANKING_RUNTIME=ollama RERANKING_MODEL=zerank-2-score \
    npx vitest run --config vitest.ontology-batching.mts >> "$out/run-$name.log" 2>&1
  local status=$?
  echo "$(date +%T) end $name exit=$status"
  if [ $status -ne 0 ]; then exit $status; fi
}

all=""
sequential='{"retrievalConcurrency":1,"analysisConcurrency":1,"analyzerContextTokens":65536}'
parallel_rest="humanitarian_rights/humanitarian_rights-86.pdf,humanitarian_rights/humanitarian_rights-28.pdf"
parallel='{"retrievalConcurrency":4,"analysisConcurrency":4,"analyzerContextTokens":12288}'
context_only='{"retrievalConcurrency":1,"analysisConcurrency":1,"analyzerContextTokens":12288}'
category_small="political/political-26.pdf,political/political-76.pdf,humanitarian_rights/humanitarian_rights-28.pdf"
case "${RESUME:-}" in
  final)
    run baseline-repeat 1 "$sequential" "" "$small"
    run context-only 1 "$context_only" "" "$small"
    run category 4 "$parallel" category "$category_small"
    taskkill //F //IM ollama.exe >/dev/null 2>&1
    echo "$(date +%T) all done"
    exit 0 ;;
  category)
    run category 4 "$parallel" category "$category_small"
    taskkill //F //IM ollama.exe >/dev/null 2>&1
    echo "$(date +%T) all done"
    exit 0 ;;
  noise)
    run baseline-repeat 1 "$sequential" "" "$small"
    run context-only 1 "$context_only" "" "$small"
    exit 0 ;;
  parallel)
    run parallel 4 "$parallel" "" "$parallel_rest" ;;
  *)
    run baseline 1 "$sequential" "" "$all"
    run parallel 4 "$parallel" "" "$all" ;;
esac
run category 4 "$parallel" category "$all"
run baseline-repeat 1 "$sequential" "" "$small"
run context-only 1 "$context_only" "" "$small"
taskkill //F //IM ollama.exe >/dev/null 2>&1
echo "$(date +%T) all done"
