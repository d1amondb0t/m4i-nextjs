"use client";

import { type ChangeEvent, type FormEvent, useState } from "react";

import {
  RAG_DOCUMENT_INPUT_ACCEPT,
  RAG_DOCUMENT_TYPE_LABEL,
  validateRagDocumentSelection,
} from "@/app/server/documents/upload-policy";
import type {
  HierarchyItem,
  HierarchyPipelineResponse,
} from "@/types/hierarchy-types";
import type { UploadStatus } from "@/types/document-upload";

type SuccessfulHierarchyResponse = Extract<HierarchyPipelineResponse, { ok: true }>;

const EXAMPLE_ONTOLOGY = JSON.stringify(
  {
    dimensions: [
      {
        id: "political",
        name: "Political",
        definition:
          "Changes involving political institutions, policy, governance, or public decision-making.",
        categories: [
          {
            id: "advocacy_policy_influence",
            name: "Advocacy & policy influence",
            definition:
              "Efforts or changes intended to influence laws, policies, political agendas, or public decision-makers.",
            include: [
              "policy recommendations",
              "government engagement",
              "legislative or regulatory influence",
            ],
            exclude: ["general public awareness without a policy objective"],
          },
        ],
      },
    ],
  },
  null,
  2,
);

function Assessment({ item }: { item: HierarchyItem }) {
  const scores = [
    ["Category", item.assessment.categoryFit],
    ["Type", item.assessment.typeFit],
    ["Evidence", item.assessment.evidenceSupport],
    ["Specificity", item.assessment.specificity],
  ] as const;

  return (
    <div className="mt-3">
      <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {scores.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-zinc-100 px-2 py-1.5">
            <dt className="text-zinc-500">{label}</dt>
            <dd className="font-semibold text-zinc-900">{value.toFixed(2)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs leading-5 text-zinc-500">
        {item.assessment.reason}
      </p>
    </div>
  );
}

function ItemList({ items, empty }: { items: HierarchyItem[]; empty: string }) {
  if (items.length === 0) {
    return <p className="mt-3 text-sm text-zinc-500">{empty}</p>;
  }

  return (
    <ul className="mt-3 space-y-3">
      {items.map((item, index) => (
        <li key={`${item.text}-${index}`} className="rounded-xl border border-zinc-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium leading-6 text-zinc-900">{item.text}</p>
            <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">
              {item.explicitness}
            </span>
          </div>
          <Assessment item={item} />
          <ul className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
            {item.evidence.map((evidence) => (
              <li key={`${evidence.chunkId}-${evidence.quote}`} className="text-xs leading-5 text-zinc-600">
                <p>&ldquo;{evidence.quote}&rdquo;</p>
                <p className="mt-1 text-zinc-400">
                  {evidence.source} · page {evidence.page} · chunk {evidence.chunk} · retrieval {evidence.retrievalScore.toFixed(3)}
                </p>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function HierarchyUpload() {
  const [files, setFiles] = useState<File[]>([]);
  const [ontology, setOntology] = useState(EXAMPLE_ONTOLOGY);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SuccessfulHierarchyResponse | null>(null);
  const [status, setStatus] = useState<UploadStatus>({ type: "idle", message: "" });

  function handleSelection(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    const error = validateRagDocumentSelection(selected);

    if (error) {
      setFiles([]);
      setResult(null);
      setStatus({ type: "error", message: error });
      return;
    }

    setFiles(selected);
    setResult(null);
    setStatus({ type: "idle", message: "" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const documentError = validateRagDocumentSelection(files);

    if (documentError) {
      setStatus({ type: "error", message: documentError });
      return;
    }

    try {
      JSON.parse(ontology);
    } catch {
      setStatus({ type: "error", message: "Framework ontology must be valid JSON." });
      return;
    }

    const formData = new FormData();

    for (const file of files) formData.append("documents", file);
    formData.append("ontology", ontology);
    setIsSubmitting(true);
    setResult(null);
    setStatus({ type: "idle", message: "" });

    try {
      const response = await fetch("/api/hierarchy", { method: "POST", body: formData });
      const body = (await response.json()) as HierarchyPipelineResponse;

      if (!response.ok || !body.ok) {
        throw new Error(body.ok ? "The hierarchy pipeline failed." : body.message);
      }

      setResult(body);
      const accepted = body.diagnostics.reduce(
        (count, diagnostic) => count + diagnostic.acceptedCandidates,
        0,
      );
      setStatus({
        type: "success",
        message: `${body.indexedChunks} chunks indexed; ${accepted} candidates accepted.`,
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "The experiment could not run.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <form onSubmit={handleSubmit}>
          <label htmlFor="hierarchy-documents" className="text-sm font-medium text-zinc-900">
            Evidence documents
          </label>
          <p className="mt-1 text-sm text-zinc-500">{RAG_DOCUMENT_TYPE_LABEL}</p>
          <input
            id="hierarchy-documents"
            type="file"
            accept={RAG_DOCUMENT_INPUT_ACCEPT}
            multiple
            onChange={handleSelection}
            className="mt-3 block w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm text-zinc-700 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-950 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
          />
          {files.length > 0 ? (
            <p className="mt-2 text-xs text-zinc-500">
              {files.map((file) => file.name).join(", ")}
            </p>
          ) : null}

          <label htmlFor="ontology" className="mt-6 block text-sm font-medium text-zinc-900">
            Framework ontology
          </label>
          <p className="mt-1 text-sm text-zinc-500">
            Define dimensions and leaf categories. IDs must be unique across the ontology.
          </p>
          <textarea
            id="ontology"
            value={ontology}
            rows={20}
            spellCheck={false}
            onChange={(event) => {
              setOntology(event.target.value);
              setResult(null);
              setStatus({ type: "idle", message: "" });
            }}
            className="mt-3 w-full resize-y rounded-xl border border-zinc-300 bg-zinc-950 px-4 py-3 font-mono text-xs leading-5 text-zinc-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />

          <ol className="mt-6 grid gap-2 text-xs text-zinc-600 sm:grid-cols-5">
            {[
              "Index once",
              "Query each leaf",
              "Extract JSON",
              "Validate evidence",
              "Consolidate",
            ].map((step, index) => (
              <li key={step} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                <span className="mr-1 font-semibold text-blue-700">{index + 1}.</span>
                {step}
              </li>
            ))}
          </ol>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p
              aria-live="polite"
              className={`text-sm ${status.type === "error" ? "text-red-600" : status.type === "success" ? "text-emerald-700" : "text-zinc-500"}`}
            >
              {status.message}
            </p>
            <button
              type="submit"
              disabled={files.length === 0 || !ontology.trim() || isSubmitting}
              className="rounded-xl bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {isSubmitting ? "Running category passes…" : "Run hierarchy experiment"}
            </button>
          </div>
        </form>
      </section>

      {result ? (
        <section className="mt-8 space-y-7">
          {result.framework.dimensions.map((dimension) => (
            <article key={dimension.id} className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Dimension</p>
              <h2 className="mt-2 text-2xl font-semibold text-zinc-950">{dimension.name}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{dimension.definition}</p>

              <div className="mt-7 space-y-6">
                {dimension.categories.map((category) => (
                  <section key={category.id} className="rounded-2xl border border-zinc-200 p-5">
                    <h3 className="font-semibold text-zinc-950">{category.name}</h3>
                    <p className="mt-1 text-sm leading-6 text-zinc-500">{category.definition}</p>
                    <div className="mt-5 grid gap-6 lg:grid-cols-2">
                      <div>
                        <h4 className="text-sm font-semibold text-zinc-900">Outcomes</h4>
                        <ItemList items={category.outcomes} empty="No outcome met every threshold." />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-zinc-900">Indicators</h4>
                        <ItemList items={category.indicators} empty="No indicator met every threshold." />
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            </article>
          ))}

          <details className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
            <summary className="cursor-pointer font-semibold text-zinc-950">Retrieval and rejection diagnostics</summary>
            <div className="mt-5 space-y-4">
              {result.diagnostics.map((diagnostic) => (
                <div key={diagnostic.categoryId} className="rounded-xl border border-zinc-200 p-4 text-sm">
                  <p className="font-medium text-zinc-900">{diagnostic.categoryId}</p>
                  <p className="mt-1 text-zinc-500">
                    {diagnostic.retrievedChunks} retrieved · {diagnostic.extractedCandidates} extracted · {diagnostic.acceptedCandidates} accepted
                  </p>
                  {diagnostic.rejected.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-600">
                      {diagnostic.rejected.map((rejection, index) => (
                        <li key={`${rejection.candidateId}-${index}`}>
                          <span className="font-medium text-zinc-800">{rejection.text}:</span>{" "}
                          {rejection.reason}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </details>
        </section>
      ) : null}
    </>
  );
}
