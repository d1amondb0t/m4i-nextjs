import type { HierarchyEvidence } from "@/types/hierarchy-types";
import type {
  CategoryIndicatorResult,
  DocumentIndicator,
  HorizonResult,
  IndicatorAnswer,
  IndicatorPipelineResult,
  MatchGate,
} from "@/types/indicator-types";

import {
  BASIS_STYLES,
  categoryLabel,
  HORIZON_LABELS,
  resultSummary,
} from "./indicator-results-helper";

function ScoreBar({ score, threshold }: { score: number; threshold: number }) {
  return (
    <div
      className="flex items-center gap-2"
      title={`Best reranker score ${score.toFixed(3)}; gate ${threshold}`}
    >
      <div className="relative h-2 w-28 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full ${score >= threshold ? "bg-emerald-500" : "bg-zinc-400"}`}
          style={{ width: `${Math.min(100, score * 100)}%` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-zinc-900"
          style={{ left: `${threshold * 100}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-zinc-600">
        {score.toFixed(2)}
      </span>
    </div>
  );
}

function Evidence({ evidence }: { evidence: HierarchyEvidence }) {
  return (
    <blockquote className="mt-2 border-l-2 border-zinc-200 pl-3 text-xs leading-5 text-zinc-600">
      <p>&ldquo;{evidence.quote}&rdquo;</p>
      <footer className="mt-1 text-[11px] text-zinc-400">
        {evidence.source} · page {evidence.page} · chunk {evidence.chunk}
        {evidence.scores.rerankerScore !== null
          ? ` · rerank ${evidence.scores.rerankerScore.toFixed(2)}`
          : ""}
      </footer>
    </blockquote>
  );
}

function DocumentIndicatorItem({
  indicator,
}: {
  indicator: DocumentIndicator;
}) {
  return (
    <li className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
      <p className="text-sm font-medium text-zinc-900">{indicator.name}</p>
      <p className="mt-1 text-sm text-blue-900">{indicator.value}</p>
      <Evidence evidence={indicator.evidence} />
    </li>
  );
}

function AnswerItem({ answer }: { answer: IndicatorAnswer }) {
  const basis = BASIS_STYLES[answer.basis];
  return (
    <li className="rounded-xl border border-zinc-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-zinc-900">
          {answer.indicator.name}
        </p>
        <span
          title={basis.description}
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${basis.className}`}
        >
          {basis.label} · {answer.confidence}
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">{answer.indicator.question}</p>
      <p className="mt-2 text-sm text-zinc-900">{answer.answer}</p>
      {answer.rationale ? (
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          {answer.rationale}
        </p>
      ) : null}
      {answer.evidence ? <Evidence evidence={answer.evidence} /> : null}
      {answer.groundingFailed ? (
        <p className="mt-2 text-[11px] text-red-600">
          The model&rsquo;s quote was not found in the document, so this answer
          is not treated as reported.
        </p>
      ) : null}
    </li>
  );
}

function HorizonColumn({ horizon }: { horizon: HorizonResult }) {
  const label = HORIZON_LABELS[horizon.horizon];
  return (
    <section className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4">
      <h4 className="text-sm font-semibold text-zinc-950">{label.title}</h4>
      <p className="text-[11px] uppercase tracking-wide text-zinc-400">
        {label.timing}
      </p>
      <p className="mt-2 text-xs leading-5 text-zinc-600">
        {horizon.outcome.statement}
      </p>

      <p className="mt-4 text-xs font-semibold text-zinc-700">
        In the document ({horizon.documentIndicators.length})
      </p>
      {horizon.documentIndicators.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {horizon.documentIndicators.map((indicator, index) => (
            <DocumentIndicatorItem
              key={`${indicator.name}-${index}`}
              indicator={indicator}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-zinc-500">
          None found for this horizon.
        </p>
      )}

      {horizon.usedPredefined ? (
        <>
          <p className="mt-4 text-xs font-semibold text-zinc-700">
            Predefined indicators ({horizon.answers.length})
          </p>
          <ul className="mt-2 space-y-2">
            {horizon.answers.map((answer) => (
              <AnswerItem key={answer.indicator.id} answer={answer} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function CategoryCard({
  category,
  gate,
}: {
  category: CategoryIndicatorResult;
  gate: MatchGate;
}) {
  return (
    <article className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Triggered
          </p>
          <h3 className="mt-1 text-xl font-semibold text-zinc-950">
            {category.categoryName}
          </h3>
        </div>
        <ScoreBar
          score={category.bestRerankerScore}
          threshold={gate.minimumRerankerScore}
        />
      </div>

      <details className="mt-4 rounded-xl border border-zinc-200 p-3">
        <summary className="cursor-pointer text-sm font-medium text-zinc-800">
          Why it triggered: {category.triggeringMatches.length} match
          {category.triggeringMatches.length === 1 ? "" : "es"} at or above{" "}
          {gate.minimumRerankerScore}
        </summary>
        <ul className="mt-3 space-y-3">
          {category.triggeringMatches.map((match, index) => (
            <li key={`${match.question}-${index}`} className="text-sm">
              <p className="font-medium text-zinc-900">{match.question}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {match.explicitness} · {match.reason}
              </p>
              {match.evidence.map((evidence) => (
                <Evidence
                  key={`${evidence.chunkId}-${evidence.quote}`}
                  evidence={evidence}
                />
              ))}
            </li>
          ))}
        </ul>
      </details>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {category.horizons.map((horizon) => (
          <HorizonColumn key={horizon.horizon} horizon={horizon} />
        ))}
      </div>
    </article>
  );
}

export function IndicatorResults({
  result,
  gate,
}: {
  result: IndicatorPipelineResult;
  gate: MatchGate;
}) {
  const summary = resultSummary(result);
  const stats = [
    {
      label: "Categories triggered",
      value: `${summary.triggered} of ${summary.total}`,
    },
    {
      label: "Indicators found in the document",
      value: summary.documentIndicators,
    },
    {
      label: "Horizons using predefined indicators",
      value: summary.predefinedHorizons,
    },
    {
      label: "Predefined answers: reported / inferred / unknown",
      value: `${summary.reported} / ${summary.inferred} / ${summary.unknown}`,
    },
  ];

  return (
    <section className="mt-8 space-y-6">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-zinc-200 bg-white p-4"
          >
            <dt className="text-xs text-zinc-500">{stat.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-zinc-950">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      {result.categories.map((category) => (
        <CategoryCard
          key={category.categoryId}
          category={category}
          gate={gate}
        />
      ))}

      {result.skippedCategories.length > 0 ? (
        <section className="rounded-3xl border border-dashed border-zinc-300 bg-white p-5 sm:p-7">
          <h3 className="text-sm font-semibold text-zinc-700">
            Not triggered: no match reached the {gate.minimumRerankerScore}{" "}
            reranker gate
          </h3>
          <ul className="mt-3 space-y-2">
            {result.skippedCategories.map((category) => (
              <li
                key={category.categoryId}
                className="flex flex-col gap-1 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between"
              >
                <span>{categoryLabel(category.categoryId)}</span>
                <ScoreBar
                  score={category.bestRerankerScore}
                  threshold={gate.minimumRerankerScore}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
