"use client";

import type {
  IndicatorRunSettings,
  SnapshotItem,
  SnapshotQuestion,
} from "@/types/feedback-types";
import { ChunkCard } from "./chunk-card";
import { EvidenceQuote } from "./evidence-quote";
import { FeedbackControls } from "./feedback-controls";
import {
  BASIS_STYLES,
  categoryLabel,
  HORIZON_LABELS,
  indicatorCategoryGroups,
  type IndicatorCategoryGroup,
} from "./indicator-review-helper";
import { countLabel } from "./review-helper";
import type { FeedbackController } from "./use-feedback";

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

function ItemBadge({ item }: { item: SnapshotItem }) {
  if (item.indicator?.source !== "predefined") {
    return (
      <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800 ring-1 ring-blue-200">
        In the document
      </span>
    );
  }

  const basis = BASIS_STYLES[item.indicator.basis];
  return (
    <span
      title={basis.description}
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${basis.className}`}
    >
      {basis.label} · {item.indicator.confidence}
    </span>
  );
}

function IndicatorItem({
  item,
  question,
  controller,
}: {
  item: SnapshotItem;
  question: SnapshotQuestion;
  controller: FeedbackController;
}) {
  const indicator = item.indicator;
  const chunksById = new Map(question.chunks.map((chunk) => [chunk.id, chunk]));

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-zinc-900">{indicator?.name}</p>
        <ItemBadge item={item} />
      </div>
      {indicator?.source === "predefined" && (
        <p className="mt-1 text-xs text-zinc-500">{indicator.question}</p>
      )}
      <p className="mt-2 text-sm text-zinc-900">{item.answer}</p>
      {indicator?.source === "predefined" && indicator.rationale && (
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          {indicator.rationale}
        </p>
      )}
      {item.evidence.length > 0 && (
        <ul className="mt-2 space-y-2 border-t border-zinc-100 pt-2">
          {item.evidence.map((evidence) => (
            <EvidenceQuote
              key={`${evidence.runChunkId}-${evidence.quote}`}
              quote={evidence.quote}
              chunk={chunksById.get(evidence.runChunkId)}
            />
          ))}
        </ul>
      )}
      {indicator?.source === "predefined" && indicator.groundingFailed && (
        <p className="mt-2 text-[11px] text-red-600">
          The model&rsquo;s quote was not found in the document, so this answer
          is not treated as reported.
        </p>
      )}
      <div className="mt-3">
        <FeedbackControls
          controller={controller}
          targetType="run_item"
          targetId={item.id}
          verdicts={["accepted", "rejected"]}
          commentPrompt="What is wrong or missing? (optional)"
        />
      </div>
    </li>
  );
}

function HorizonColumn({
  question,
  controller,
}: {
  question: SnapshotQuestion;
  controller: FeedbackController;
}) {
  const label = HORIZON_LABELS[question.horizon!];
  const documentItems = question.items.filter(
    (item) => item.kind === "document_indicator",
  );
  const predefinedItems = question.items.filter(
    (item) => item.kind === "indicator_answer",
  );

  return (
    <section className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4">
      <h4 className="text-sm font-semibold text-zinc-950">{label.title}</h4>
      <p className="text-[11px] uppercase tracking-wide text-zinc-400">
        {label.timing}
      </p>
      <p className="mt-2 text-xs leading-5 text-zinc-600">
        {question.question}
      </p>

      <p className="mt-4 text-xs font-semibold text-zinc-700">
        In the document ({documentItems.length})
      </p>
      {documentItems.length === 0 ? (
        <p className="mt-1 text-xs text-zinc-500">
          None found for this horizon.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {documentItems.map((item) => (
            <IndicatorItem
              key={item.id}
              item={item}
              question={question}
              controller={controller}
            />
          ))}
        </ul>
      )}

      {predefinedItems.length > 0 && (
        <>
          <p className="mt-4 text-xs font-semibold text-zinc-700">
            Predefined indicators ({predefinedItems.length})
          </p>
          <ul className="mt-2 space-y-2">
            {predefinedItems.map((item) => (
              <IndicatorItem
                key={item.id}
                item={item}
                question={question}
                controller={controller}
              />
            ))}
          </ul>
        </>
      )}

      {question.chunks.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-zinc-700 hover:text-zinc-950">
            Passages the model read ({question.chunks.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {question.chunks.map((chunk) => (
              <ChunkCard
                key={chunk.id}
                chunk={chunk}
                controller={controller}
                citedBy={
                  question.items.filter((item) =>
                    item.evidence.some(
                      (evidence) => evidence.runChunkId === chunk.id,
                    ),
                  ).length
                }
              />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function CategoryCard({
  group,
  threshold,
  controller,
}: {
  group: IndicatorCategoryGroup;
  threshold: number;
  controller: FeedbackController;
}) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            {group.dimensionName}
          </p>
          <h3 className="mt-1 text-base font-semibold text-zinc-950">
            {group.categoryName}
          </h3>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            {group.categoryDefinition}
          </p>
        </div>
        {group.bestRerankerScore !== null && (
          <ScoreBar score={group.bestRerankerScore} threshold={threshold} />
        )}
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {group.horizons.map((question) => (
          <HorizonColumn
            key={question.id}
            question={question}
            controller={controller}
          />
        ))}
      </div>
    </article>
  );
}

export function IndicatorReview({
  questions,
  settings,
  controller,
}: {
  questions: readonly SnapshotQuestion[];
  settings: IndicatorRunSettings;
  controller: FeedbackController;
}) {
  const groups = indicatorCategoryGroups(questions, settings);
  const threshold = settings.gate.minimumRerankerScore;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-950">
          Outcome indicators
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          {countLabel(groups.length, "category", "categories")} reached a
          reranker score of {threshold} or more with {settings.ontologyFile}.
          Accept or reject every indicator.
        </p>
      </div>

      {groups.length === 0 && (
        <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-zinc-500">
          No category matched strongly enough to look for indicators.
        </p>
      )}

      {groups.map((group) => (
        <CategoryCard
          key={group.categoryId}
          group={group}
          threshold={threshold}
          controller={controller}
        />
      ))}

      {settings.skippedCategories.length > 0 && (
        <details className="rounded-2xl border border-dashed border-zinc-300 bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-700">
            Below the gate ({settings.skippedCategories.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {[...settings.skippedCategories]
              .sort((a, b) => b.bestRerankerScore - a.bestRerankerScore)
              .map((category) => (
                <li
                  key={category.categoryId}
                  className="flex flex-col gap-1 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>{categoryLabel(category.categoryId)}</span>
                  <ScoreBar
                    score={category.bestRerankerScore}
                    threshold={threshold}
                  />
                </li>
              ))}
          </ul>
        </details>
      )}
    </section>
  );
}
