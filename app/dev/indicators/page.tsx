import Link from "next/link";
import { notFound } from "next/navigation";

import { IndicatorExplorer } from "@/app/components/indicators/indicator-explorer";
import { currentUser } from "@/app/server/auth/session";
import {
  indicatorOntologyFile,
  loadIndicatorOntology,
} from "@/app/server/rag/indicators/indicator-ontology-source";

export default async function IndicatorsPage() {
  if (!(await currentUser())?.isAdmin) notFound();

  const ontologyFile = indicatorOntologyFile();
  const { dimensions } = loadIndicatorOntology();
  const categoryCount = dimensions.reduce(
    (total, dimension) => total + dimension.categories.length,
    0,
  );

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 sm:px-8 lg:py-16">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 max-w-3xl">
          <Link
            href="/dev/hierarchy"
            className="text-sm font-medium text-blue-700 hover:text-blue-900"
          >
            ← Hierarchy tester
          </Link>
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
            M4I experiment · {ontologyFile} · {dimensions.length}{" "}
            {dimensions.length === 1 ? "dimension" : "dimensions"},{" "}
            {categoryCount} categories
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Outcome indicators
          </h1>
          <p className="mt-4 text-base leading-7 text-zinc-600">
            When a category matches with a reranker score of at least the gate,
            the document&rsquo;s own short-, medium- and long-term indicators
            are listed. Horizons with none fall back to the predefined
            indicators in <code className="text-sm">{ontologyFile}</code>,
            answered from the document or inferred.
          </p>
        </header>
        <IndicatorExplorer />
      </div>
    </main>
  );
}
