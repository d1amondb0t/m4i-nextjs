import Link from "next/link";

import { HierarchyUpload } from "../components/hierarchy-upload";

export default function HierarchyPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-5 py-12 sm:px-8 lg:py-20">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 max-w-3xl">
          <Link href="/" className="text-sm font-medium text-blue-700 hover:text-blue-900">
            ← Standard RAG tester
          </Link>
          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
            M4I experiment
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
            Test hierarchy-grounded extraction
          </h1>
          <p className="mt-5 text-base leading-7 text-zinc-600 sm:text-lg">
            Retrieve evidence for every leaf category, extract outcomes and indicators, independently validate them, and inspect why candidates passed or failed.
          </p>
        </header>

        <HierarchyUpload />
      </div>
    </main>
  );
}
