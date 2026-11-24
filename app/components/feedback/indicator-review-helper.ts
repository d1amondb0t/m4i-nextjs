import type {
  IndicatorRunSettings,
  RunSettings,
  SnapshotQuestion,
} from "@/types/feedback-types";
import type { AnswerBasis, OutcomeHorizon } from "@/types/indicator-types";

export const HORIZON_LABELS: Record<
  OutcomeHorizon,
  { title: string; timing: string }
> = {
  short_term: {
    title: "Short term",
    timing: "Direct results, usually within a year",
  },
  medium_term: {
    title: "Medium term",
    timing: "Decisions, rules and practice, 1–3 years",
  },
  long_term: { title: "Long term", timing: "Lasting change, 3+ years" },
};

export const BASIS_STYLES: Record<
  AnswerBasis,
  { label: string; className: string; description: string }
> = {
  reported: {
    label: "Reported",
    className: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    description:
      "Stated in the document; the quote was found in the cited chunk.",
  },
  inferred: {
    label: "Inferred",
    className: "bg-amber-50 text-amber-800 ring-amber-200",
    description:
      "Not stated directly; reasoned from the context and the matched findings.",
  },
  unknown: {
    label: "Unknown",
    className: "bg-zinc-100 text-zinc-600 ring-zinc-200",
    description: "Nothing in the context relates to this indicator.",
  },
};

export type IndicatorCategoryGroup = {
  categoryId: string;
  dimensionName: string;
  categoryName: string;
  categoryDefinition: string;
  bestRerankerScore: number | null;
  horizons: SnapshotQuestion[];
};

export function indicatorSettings(settings: RunSettings): IndicatorRunSettings {
  return settings.indicators as IndicatorRunSettings;
}

export function isHorizonQuestion(question: SnapshotQuestion): boolean {
  return question.horizon !== null;
}

export function indicatorCategoryGroups(
  questions: readonly SnapshotQuestion[],
  settings: IndicatorRunSettings,
): IndicatorCategoryGroup[] {
  const scores = new Map(
    settings.triggeredCategories.map((category) => [
      category.categoryId,
      category.bestRerankerScore,
    ]),
  );
  const groups = new Map<string, IndicatorCategoryGroup>();

  for (const question of questions.filter(isHorizonQuestion)) {
    const categoryId = question.categoryId ?? "";
    const group = groups.get(categoryId) ?? {
      categoryId,
      dimensionName: question.dimensionName ?? "",
      categoryName: question.categoryName ?? "",
      categoryDefinition: question.categoryDefinition ?? "",
      bestRerankerScore: scores.get(categoryId) ?? null,
      horizons: [],
    };
    group.horizons.push(question);
    groups.set(categoryId, group);
  }

  return [...groups.values()];
}

export function categoryLabel(categoryId: string): string {
  return categoryId
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}
