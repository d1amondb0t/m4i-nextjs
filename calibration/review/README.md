# Follow-up RAG review

Read [the results](../results/review/report.md) and
[the research/implementation review](../../docs/rag-research-review.md).
[PLAN.md](PLAN.md) records the experiment protocol.

Run the commands shown in the results report from the project root. These are
standalone Node scripts so they do not accidentally run the earlier, expensive
index-building Vitest stages. Existing ignored experiment caches are required.
The live script resumes validated local inference from a fingerprinted cache.

The tests run directly with `node calibration/review/common.test.mjs` to avoid
spawning Node test workers in restricted Windows environments.
