"use client";

import { useState } from "react";

import type { RunSnapshot, SnapshotQuestion } from "@/types/feedback-types";
import { QuestionReview } from "./question-review";
import { groupByCategory, itemKey, reviewCounts } from "./review-helper";
import { useFeedback, type FeedbackController } from "./use-feedback";

type QuestionFilter = "all" | "matched" | "unreviewed";

const FILTERS: { value: QuestionFilter; label: string }[] = [
  { value: "all", label: "All questions" },
  { value: "matched", label: "With proposed matches" },
  { value: "unreviewed", label: "Matches not reviewed yet" },
];

function keepQuestion(
  question: SnapshotQuestion,
  filter: QuestionFilter,
  controller: FeedbackController,
): boolean {
  if (filter === "all") return true;
  if (filter === "matched") return question.items.length > 0;
  return question.items.some((item) => !controller.feedback[itemKey(item.id)]);
}

function ReviewSummary({
  snapshot,
  controller,
}: {
  snapshot: RunSnapshot;
  controller: FeedbackController;
}) {
  const counts = reviewCounts(snapshot.questions, controller.feedback);
  const noun = snapshot.run.mode === "rag" ? "answer" : "matches";

  return (
    <div className="sticky top-0 z-10 -mx-5 border-b border-zinc-200 bg-zinc-50/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-zinc-600">
        <span>
          <strong className="text-zinc-900">
            {counts.reviewedItems} of {counts.items}
          </strong>{" "}
          {noun} reviewed
        </span>
        <span>{counts.rejectedItems} rejected</span>
        <span>{counts.labelledChunks} chunks labelled</span>
        <span className="text-zinc-400">
          Every click is saved straight away.
        </span>
      </div>
    </div>
  );
}

function RagReview({
  snapshot,
  controller,
}: {
  snapshot: RunSnapshot;
  controller: FeedbackController;
}) {
  const [question] = snapshot.questions;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        Your question
      </p>
      <h2 className="mt-1 text-lg font-semibold text-zinc-950">
        {question.question}
      </h2>
      <div className="mt-5">
        <QuestionReview
          question={question}
          controller={controller}
          answerLabel="Generated answer"
          emptyMessage="The model returned no answer."
        />
      </div>
    </section>
  );
}

function OntologyReview({
  snapshot,
  controller,
}: {
  snapshot: RunSnapshot;
  controller: FeedbackController;
}) {
  const initialFilter: QuestionFilter = snapshot.questions.some(
    (question) => question.items.length > 0,
  )
    ? "matched"
    : "all";
  const [filter, setFilter] = useState<QuestionFilter>(initialFilter);
  // Fixed when the filter is chosen, so a question does not vanish while
  // its reviewer is still commenting on it.
  const visibleIds = (selected: QuestionFilter) =>
    new Set(
      snapshot.questions
        .filter((question) => keepQuestion(question, selected, controller))
        .map((question) => question.id),
    );
  const [visible, setVisible] = useState(() => visibleIds(initialFilter));
  const chooseFilter = (selected: QuestionFilter) => {
    setFilter(selected);
    setVisible(visibleIds(selected));
  };
  const groups = groupByCategory(snapshot.questions)
    .map((group) => ({
      ...group,
      visible: group.questions.filter((question) => visible.has(question.id)),
    }))
    .filter((group) => group.visible.length > 0);

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label="Filter questions"
      >
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={filter === option.value}
            onClick={() => chooseFilter(option.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filter === option.value
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {groups.length === 0 && (
        <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-zinc-500">
          Nothing left under this filter.
        </p>
      )}

      {groups.map((group) => {
        const matches = group.questions.reduce(
          (total, question) => total + question.items.length,
          0,
        );
        return (
          <details
            key={group.key}
            className="group rounded-2xl border border-zinc-200 bg-white shadow-sm"
          >
            <summary className="cursor-pointer list-none p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                {group.dimensionName}
              </p>
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-zinc-950">
                  <span className="mr-1 inline-block transition group-open:rotate-90">
                    ▸
                  </span>
                  {group.categoryName}
                </h2>
                <span className="text-xs text-zinc-500">
                  {matches} proposed match{matches === 1 ? "" : "es"} ·{" "}
                  {group.questions.length} questions
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                {group.categoryDefinition}
              </p>
            </summary>
            <div className="space-y-6 border-t border-zinc-100 p-5">
              {group.visible.map((question) => (
                <section key={question.id}>
                  <h3 className="mb-3 text-sm font-semibold leading-6 text-zinc-900">
                    {question.question}
                  </h3>
                  <QuestionReview
                    question={question}
                    controller={controller}
                    answerLabel="Proposed match"
                    emptyMessage="The model proposed no match for this question. If a chunk below answers it, mark it."
                  />
                </section>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function RunReview({ snapshot }: { snapshot: RunSnapshot }) {
  const controller = useFeedback(snapshot.feedback);

  return (
    <div className="space-y-6">
      <ReviewSummary snapshot={snapshot} controller={controller} />
      {snapshot.run.mode === "rag" ? (
        <RagReview snapshot={snapshot} controller={controller} />
      ) : (
        <OntologyReview snapshot={snapshot} controller={controller} />
      )}
    </div>
  );
}
