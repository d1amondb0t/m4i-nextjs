"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useState } from "react";

import {
  RAG_DOCUMENT_INPUT_ACCEPT,
  RAG_DOCUMENT_TYPE_LABEL,
  validateRagDocumentSelection,
} from "@/app/server/documents/upload-policy";
import type { CreateJobResponse, RunMode } from "@/types/feedback-types";
import {
  MAX_QUESTION_LENGTH,
  validateQuestion,
} from "@/types/rag-pipeline-type";
import { ACTIVE_JOB_KEY, writeStorage } from "./review-helper";

type NewRunFormProps = {
  ontologyQuestions: number;
  ontologyCategories: number;
};

const MODES: { value: RunMode; title: string; description: string }[] = [
  {
    value: "rag",
    title: "Ask your own question",
    description: "Get one answer from your documents, with the chunks it used.",
  },
  {
    value: "ontology",
    title: "Run the ontology",
    description:
      "Match your documents against every question in the framework.",
  },
];

export function NewRunForm({
  ontologyQuestions,
  ontologyCategories,
}: NewRunFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<RunMode>("rag");
  const [files, setFiles] = useState<File[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    setFiles(selected);
    setError(validateRagDocumentSelection(selected) ?? "");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem =
      validateRagDocumentSelection(files) ??
      (mode === "rag" ? validateQuestion(question) : null);

    if (problem) {
      setError(problem);
      return;
    }

    const formData = new FormData();
    formData.append("mode", mode);
    if (mode === "rag") formData.append("question", question);
    for (const file of files) formData.append("documents", file);

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as CreateJobResponse;

      if (!result.ok) {
        setError(result.message);
        return;
      }

      writeStorage(ACTIVE_JOB_KEY, result.jobId);
      router.push(`/jobs/${result.jobId}`);
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
    >
      <fieldset>
        <legend className="text-sm font-semibold text-zinc-900">
          What do you want to run?
        </legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {MODES.map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer rounded-xl border p-4 ${
                mode === option.value
                  ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-600"
                  : "border-zinc-200 hover:border-zinc-400"
              }`}
            >
              <input
                type="radio"
                name="mode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
                className="sr-only"
              />
              <span className="block text-sm font-medium text-zinc-900">
                {option.title}
              </span>
              <span className="mt-1 block text-xs leading-5 text-zinc-600">
                {option.value === "ontology"
                  ? `${option.description} ${ontologyQuestions} questions across ${ontologyCategories} categories; this takes a while.`
                  : option.description}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label
          htmlFor="documents"
          className="text-sm font-semibold text-zinc-900"
        >
          Documents
        </label>
        <p className="mt-1 text-xs text-zinc-500">
          Accepted: {RAG_DOCUMENT_TYPE_LABEL}.
        </p>
        <input
          id="documents"
          type="file"
          multiple
          accept={RAG_DOCUMENT_INPUT_ACCEPT}
          onChange={selectFiles}
          className="mt-2 block w-full text-sm text-zinc-700 file:mr-3 file:rounded-full file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-700"
        />
        {files.length > 0 && (
          <ul className="mt-2 text-xs text-zinc-600">
            {files.map((file) => (
              <li key={`${file.name}-${file.size}`}>{file.name}</li>
            ))}
          </ul>
        )}
      </div>

      {mode === "rag" && (
        <div>
          <label
            htmlFor="question"
            className="text-sm font-semibold text-zinc-900"
          >
            Question
          </label>
          <textarea
            id="question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={MAX_QUESTION_LENGTH}
            rows={3}
            placeholder="What would you want to know from these documents?"
            className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm leading-6 outline-none focus:border-blue-500"
          />
        </div>
      )}

      <p className="rounded-xl bg-zinc-100 px-4 py-3 text-xs leading-5 text-zinc-600">
        Your documents and feedback are used internally to improve this tool.
        Nobody else sees your files or your runs.
      </p>

      {error && <p className="text-sm text-rose-700">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-blue-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
      >
        {submitting ? "Uploading…" : "Start the run"}
      </button>
    </form>
  );
}
