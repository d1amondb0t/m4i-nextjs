"use client";

import { type ChangeEvent, type FormEvent, useState } from "react";

import {
  RAG_DOCUMENT_INPUT_ACCEPT,
  RAG_DOCUMENT_TYPE_LABEL,
  validateRagDocumentSelection,
} from "@/app/server/documents/upload-policy";
import type {
  HierarchyMatch,
  HierarchyPipelineResponse,
} from "@/types/hierarchy-types";
import type { UploadStatus } from "@/types/document-upload";

import ONTOLOGY from "@/ontology.json"

type SuccessfulHierarchyResponse = Extract<HierarchyPipelineResponse, { ok: true }>;

const EXAMPLE_ONTOLOGY = JSON.stringify(ONTOLOGY, null , 2);

function MatchList({ matches }: { matches: HierarchyMatch[] }) {
  if (matches.length === 0) {
    return <p className="mt-3 text-sm text-zinc-500">No relevant candidate passages were found.</p>;
  }

  return (
    <ul className="mt-3 space-y-3">
      {matches.map((match, index) => (
        <li key={`${match.question}-${index}`} className="rounded-xl border border-zinc-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium leading-6 text-zinc-900">{match.question}</p>
            <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">
              {match.explicitness}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-500">{match.reason}</p>
          <ul className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
            {match.evidence.map((evidence) => (
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
      const matched = body.diagnostics.reduce(
        (count, diagnostic) => count + diagnostic.matchedQuestions,
        0,
      );
      const candidates = body.diagnostics.reduce(
        (count, diagnostic) => count + diagnostic.matchedCandidates,
        0,
      );
      setStatus({
        type: "success",
        message: `${body.indexedChunks} chunks indexed; ${candidates} candidate passages across ${matched} questions.`,
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
            disabled={isSubmitting}
            onChange={handleSelection}
            className="mt-3 block w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm text-zinc-700 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-950 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
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
            Define dimensions, categories, and their questions. IDs must be unique across the ontology.
          </p>
          <textarea
            id="ontology"
            value={ontology}
            rows={20}
            spellCheck={false}
            disabled={isSubmitting}
            onChange={(event) => {
              setOntology(event.target.value);
              setResult(null);
              setStatus({ type: "idle", message: "" });
            }}
            className="mt-3 w-full resize-y rounded-xl border border-zinc-300 bg-zinc-950 px-4 py-3 font-mono text-xs leading-5 text-zinc-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          />

          <ol className="mt-6 grid gap-2 text-xs text-zinc-600 sm:grid-cols-3">
            {[
              "Index once",
              "Match each question",
              "Inspect explicit / implicit evidence",
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
              {isSubmitting ? "Running category passes…" : "Run hierarchy matching"}
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
                    <MatchList matches={category.matches} />
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
                    {diagnostic.retrievedChunks} chunks retrieved · {diagnostic.matchedCandidates} candidate passages · {diagnostic.matchedQuestions} questions matched
                  </p>
                  <ul className="mt-3 space-y-1 text-xs leading-5 text-zinc-600">
                    {diagnostic.questions.map((question, index) => (
                      <li key={`${question.question}-${index}`}>
                        {question.question}: {question.retrievedChunks} chunks · {question.generatedCandidates} proposed · {question.acceptedCandidates} retained
                      </li>
                    ))}
                  </ul>
                  {diagnostic.rejected.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-600">
                      {diagnostic.rejected.map((rejection, index) => (
                        <li key={`${rejection.question}-${index}`}>
                          <span className="font-medium text-zinc-800">{rejection.question}:</span>{" "}
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
