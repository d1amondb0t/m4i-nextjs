# RAG research and branch review — 9 September 2026

The experimental direction is useful: asymmetric embeddings, dense/lexical
fusion, and candidate-pool reuse are sensible. The first-stage arithmetic
reproduces exactly. The branch's strongest conclusions about adaptive-k,
conformal guarantees, and universally harmful cross-encoders are not established.
Read the measured results in
[the new report](../calibration/results/review/report.md), and the configurations
in [the frozen protocol](../calibration/review/PLAN.md).

## Review findings

| Priority | Finding | Consequence / disposition |
|---|---|---|
| P1 | Both application constructors omitted the Ollama client required by the new default LLM reranker. | Fixed both constructors; regression tests exercise the real default Retriever with mocked service boundaries. |
| P1 | Stage 5 ranks its parameter combinations on `evaluation`, then calls the winner held-out. Earlier stages also choose models using all 84 questions. | New seven-fold category-separated tuning avoids this extra leakage. Previous benchmark exposure still prevents a fresh-test claim. |
| P1 | `adaptiveSelect` is used by calibration only; neither application pipeline calls it. The Retriever returns `topK=5` first. | The advertised adaptive-k behavior is not deployed. Wiring it later requires selection over the full reranked pool and explicit accept/ambiguous/reject handling. |
| P1 | Original judge cache keys contain question ID and passage text, but not question text, rubric, model digest or ontology version. | Rewording an ontology question under the same ID can silently reuse stale labels. The new live cache fingerprints inputs, rubric, model digest and context settings. |
| P1 | Missing judge verdicts become `false`; missing pointwise ratings become zero. | Inference failures can masquerade as relevance decisions. New live judging validates complete verdicts, retries, then splits failing batches; no unknown passage is scored as negative. Old raw responses were not retained, so the affected historical-label count is unknown. |
| P2 | Top-question-score conformal calibration is presented as evidence retention; acceptance filtering and maximum-k can discard relevant evidence afterwards. | A top-score quantile concerns question rejection under its assumptions. New query-level CRC explicitly measures candidate-pool recall loss without a k cap. |
| P2 | Stage 1 pools by chunking; stage 2 changes to individual-pool ideal rankings and recall denominators. | Compare rerankers within one pool. Cross-chunk-size recall and cross-stage nDCG comparisons cannot support the original headline interpretation. New comparisons keep the denominator fixed within each experiment. |
| P2 | Qwen supplies both reference labels and pointwise/listwise rankings. Gemma agrees on only 69.4% of 504 pairs. | Shared model preferences need not cancel. Kappa does not determine the true labels, the direction of AUC bias, or a universal significance threshold. |
| P2 | Rerankers and judge see different evidence: LLM ranking uses the first 220 words; the judge uses full bodies. Default model context is not recorded. | A long-passage reranking loss can reflect truncation, not an inherently inferior architecture. Log actual token counts and test matched evidence windows. |
| P2 | Stage 5's first configuration reports rejection threshold .7, but application defaults use .6. The report also omits rejected questions from adaptive precision. | The displayed result is not a direct measurement of the shipped configuration. New report shows unconditional precision, coverage and evidence volume. |
| P2 | `fitAcceptThreshold` can return threshold 1 and `attainable=false` for an irrelevant score of 1. Callers that ignore `attainable` still accept it. | A future selection integration must represent “accept none” explicitly and respect fit status. This experiment uses explicit fixed threshold candidates instead. |

The historical `precisionAtK` helper divides by the number returned when fewer
than k results exist. That is returned-set precision rather than standard P@k;
the new harness divides P@5 by five and reports returned-set precision separately.
All historical first-stage pools had enough results, so their reproduced P@5 is
unchanged. The experiment config also depends on cached stage outputs rather
than enforcing stage dependency order; run individual stages intentionally.

## What the research suggests

**Tune fusion before buying a larger model.** RRF combines rankings without
requiring comparable dense and lexical score scales. The original work supports
rank fusion, not a universal optimal weight for this corpus. Our extension
tests weights and smoothing constants; its observed preference for a 3:1 dense
weight needs confirmation on new questions. [Cormack et al., SIGIR 2009](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf).

**Preserve diversity without discarding corroboration.** MMR balances relevance
against redundancy. Here, token-Jaccard MMR and per-document caps did not improve
precision. A source page is also not a fact: two chunks on one page can contain
different outcomes. Prefer span/claim identity, source coordinates and duplicate
document hashes over aggressive document caps. [Carbonell and Goldstein, 1998](https://www.cs.cmu.edu/~jgc/publication/The_Use_MMR_Diversity_Based_LTMIR_1998.pdf).

**Give context a precise job.** Contextual Retrieval generates a short
chunk-specific explanation using its parent document. The branch's title/page
header is a different intervention. Test 50–100 words of grounded context on
embedding and BM25 separately, retain original source text for evidence, and
compare within the same token budget. Do not let generated context become a
citable fact. [Anthropic's method and experiments](https://www.anthropic.com/engineering/contextual-retrieval).

**Test evidence visibility, not just chunk size.** Long-context retrieval and
generation can degrade when useful information is poorly positioned. Compare
head-220, a query-selected 220-word window, and sliding windows; log tokenizer
lengths, truncations, inference failures and latency. Word counts alone do not
establish token counts. [Liu et al., TACL 2024](https://aclanthology.org/2024.tacl-1.9/).

**Use the model's actual input contract.** Qwen's model card prescribes
instruction-bearing queries and no corresponding document instruction. The
branch follows that basic asymmetry. Comparing it to BGE changes architecture,
weights, context limits and instruction simultaneously; a gain cannot be
attributed solely to better prompting. [Qwen3-Embedding-0.6B model card](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B).

**State which risk is controlled.** Conformal risk control supports bounded,
monotone losses. The implemented experiment uses one loss per question:
fraction of relevant retrieved candidates dropped by a score threshold. It
selects the largest threshold with `(sum(calibration losses)+1)/(n+1) <= alpha`.
This is not a guarantee of corpus recall, precision, factual correctness or
performance under distribution shift. Category grouping reduces sibling-query
leakage; it does not prove exchangeability of these hand-authored questions.
[Angelopoulos et al., Conformal Risk Control](https://arxiv.org/abs/2208.02814).

**Separate evaluator disagreement from truth.** The six-candidate Gemma subset
is a useful sensitivity check, not independent full-pool ground truth. Different
judges can change system order. Use a human-adjudicated sample with source spans,
and report disagreement by evidence type and document source. Evidence of
self-preference is more nuanced than simply subtracting two judges' scores.
[Beyond the Surface, EMNLP 2025](https://aclanthology.org/2025.emnlp-main.86/).

## How to write a more useful ontology

Keep a **concept vocabulary** separate from **claims observed in documents**.
For concepts, use stable IDs, a preferred label, aliases and acronyms, a concise
scope definition, positive examples, boundary cases, and broader/related
relationships. This maps naturally to SKOS labels, scope notes and relations.
For evidence, store its source and extraction provenance separately.
[W3C SKOS](https://www.w3.org/TR/skos-reference/),
[W3C PROV-O](https://www.w3.org/TR/prov-o/).

For this project's policy-adoption category, an implementable proposal is:

| Field | Example / rule |
|---|---|
| Concept ID | Keep `advocacy_policy_influence` stable; version the definition separately. |
| Preferred label | Policy adoption and policy influence |
| Aliases | legislative uptake; regulatory adoption; official guidance; policy recommendation uptake |
| Outcome scope | A documented change in policy, regulation, official guidance, or decision-maker commitment; record which kind. |
| Separate activity | A meeting, consultation, workshop or submitted recommendation is an activity unless an ensuing change is evidenced. |
| Status | proposed, committed, adopted, implemented, repealed; never infer implemented from adopted. |
| Actor and instrument | Identify the institution, intervention/project and policy instrument independently. Unknown stays null. |
| Time and place | Observation period, publication date, geography/jurisdiction; distinguish these explicitly. |
| Indicator definition | Measure name, unit, denominator, population, frequency, disaggregation; distinct from a measured value. |
| Indicator observation | Value, unit, baseline/target/actual, date and population; retain qualifiers and uncertainty. |
| Evidence | Exact quote, document hash, page/table/row or character offsets, source date; generated headers are not evidence. |
| Causal status | reported association, claimed contribution, or supported causal attribution; never infer causation from topical proximity. |

Keep inclusion vocabulary in a separate retrieval query, while exclusions remain
instructions for classification. The current `buildCategoryQuery` embeds both
include and exclude terms; a lexical retriever does not interpret prose negation
as a Boolean exclusion. That is a testable contamination risk, not proof that
removing every exclusion will improve retrieval.

Break compound ontology questions into atomic evidence needs while retaining a
shared parent question ID. For “what policy change was sought and was it
adopted?”, retrieve the proposed change and adoption evidence separately, then
require actor/instrument/time compatibility before merging. “This work” needs
an explicit project/document scope; cross-corpus topical recall is insufficient.

OG-RAG grounds document facts in typed ontology relations and retrieves a compact
set of connected facts. Our live vocabulary-expansion experiment tests only a
small precursor to that approach. Its result cannot confirm or refute graph
retrieval. Building the graph requires validated entity resolution, relationship
extraction and provenance first. [Sharma et al., EMNLP 2025](https://aclanthology.org/2025.emnlp-main.1674/).

## Next experiment tranche — specified, not run here

| Priority | Experiment | Configuration and acceptance criterion |
|---|---|---|
| 1 | Fresh scoped benchmark | At least 100 new document/project-scoped questions, including near-domain negatives and compound questions; hold out whole source documents. Human-adjudicate source spans and status distinctions. Freeze once before selection. |
| 2 | Truncation/failure ablation | Same candidate pools; head-220 vs lexical-window-220 vs windows of 220/40 overlap. Same model/context/seed, complete response validation, both judges and a human subset; compare evidence recall and p50/p95 latency. |
| 3 | Grounded contextual indexing | Original 400/80 bodies, headers-only control, and 50/100-word document-conditioned contexts. Separate dense-only, BM25-only, both. Use common source-span judgments and a 1,500-word generation budget. |
| 4 | Atomic ontology queries | Original question vs decomposed subquestions vs entity/status/time-constrained queries. Measure unique facts recovered and false joins, not only relevant chunks. |
| 5 | Table-aware evidence | Preserve table headers, units, dates and row labels; compare existing PDF text extraction to table-aware chunks on annotated table-heavy documents. Missing units or a wrong denominator count as errors. |
| 6 | Typed claim retrieval | Entity/relationship facts with exact provenance vs text-only hybrid at the same context budget. Require factual precision improvements before building the full graph. |

These are additional research directions, not results claimed by this run. The
completed experiments, including negative findings, are in the accompanying
metrics report.
