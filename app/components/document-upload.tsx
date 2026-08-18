"use client";

import { type ChangeEvent, type FormEvent, useState, } from "react";
import { MAX_DOCUMENT_COUNT, MAX_DOCUMENT_SIZE_MB, RAG_DOCUMENT_INPUT_ACCEPT, RAG_DOCUMENT_TYPE_LABEL, validateRagDocumentSelection, } from "@/app/server/documents/upload-policy";
import type { UploadStatus } from "@/types/document-upload";
import { MAX_QUESTION_LENGTH, type RagPipelineResponse, validateQuestion, } from "@/types/rag-pipeline-type";

type SuccessfulPipelineResponse = Extract<RagPipelineResponse, { ok: true }>;

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentUpload() {
  const [files, setFiles] = useState<File[]>([]);
  const [question, setQuestion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SuccessfulPipelineResponse | null>(null);
  const [status, setStatus] = useState<UploadStatus>({
    type: "idle",
    message: "",
  });

  function handleSelection(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    const validationError = validateRagDocumentSelection(selectedFiles);

    if (validationError) {
      setFiles([]);
      setResult(null);
      setStatus({ type: "error", message: validationError });
      return;
    }

    setFiles(selectedFiles);
    setResult(null);
    setStatus({ type: "idle", message: "" });
  }

  function removeFile(index: number) {
    setFiles((currentFiles) =>
      currentFiles.filter((_, currentIndex) => currentIndex !== index),
    );
    setResult(null);
    setStatus({ type: "idle", message: "" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError =
      validateRagDocumentSelection(files) ?? validateQuestion(question);

    if (validationError) {
      setStatus({
        type: "error",
        message: validationError,
      });
      return;
    }

    const formData = new FormData();

    for (const file of files) {
      formData.append("documents", file);
    }
    formData.append("question", question);

    setIsSubmitting(true);
    setResult(null);
    setStatus({ type: "idle", message: "" });

    try {
      const response = await fetch("/api/rag", {
        method: "POST",
        body: formData,
      });

      const pipelineResponse = (await response.json()) as RagPipelineResponse;

      if (!response.ok || !pipelineResponse.ok) {
        throw new Error(
          pipelineResponse.ok
            ? "The RAG pipeline returned an unsuccessful response."
            : pipelineResponse.message,
        );
      }

      setResult(pipelineResponse);
      setStatus({
        type: "success",
        message: `${pipelineResponse.indexedChunks} chunks indexed and ${pipelineResponse.sources.length} retrieved.`,
      });
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "The documents could not be submitted.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
      <form onSubmit={handleSubmit}>
        <label
          htmlFor="documents"
          className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-6 text-center transition hover:border-blue-400 hover:bg-blue-50/50"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-blue-100 text-2xl text-blue-700">
            +
          </span>
          <span className="mt-4 font-medium text-zinc-900">
            Choose documents
          </span>
          <span className="mt-1 text-sm text-zinc-500">
            {RAG_DOCUMENT_TYPE_LABEL}
          </span>
          <span className="mt-1 text-xs text-zinc-400">
            Up to {MAX_DOCUMENT_COUNT} files, {MAX_DOCUMENT_SIZE_MB} MB each
          </span>

          <input
            id="documents"
            name="documents"
            type="file"
            accept={RAG_DOCUMENT_INPUT_ACCEPT}
            multiple
            className="sr-only"
            onChange={handleSelection}
          />
        </label>

        {files.length > 0 ? (
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-900">
                Selected documents
              </h3>
              <span className="text-xs text-zinc-500">
                {files.length} of {MAX_DOCUMENT_COUNT}
              </span>
            </div>

            <ul className="space-y-2">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {file.name}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {formatBytes(file.size)}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="shrink-0 text-sm font-medium text-zinc-500 hover:text-red-600"
                    onClick={() => removeFile(index)}
                  >
                    Remove
                    <span className="sr-only"> {file.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6">
          <label htmlFor="question" className="text-sm font-medium text-zinc-900">
            Question
          </label>
          <p className="mt-1 text-sm text-zinc-500">
            Ask something that can be answered from the selected documents.
          </p>
          <textarea
            id="question"
            name="question"
            value={question}
            maxLength={MAX_QUESTION_LENGTH}
            rows={4}
            className="mt-3 w-full resize-y rounded-xl border border-zinc-300 px-4 py-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            placeholder="What are the main conclusions?"
            onChange={(event) => {
              setQuestion(event.target.value);
              setResult(null);
              setStatus({ type: "idle", message: "" });
            }}
          />
          <p className="mt-1 text-right text-xs text-zinc-400">
            {question.length}/{MAX_QUESTION_LENGTH}
          </p>
        </div>

        <ol className="mt-6 grid gap-2 text-xs text-zinc-600 sm:grid-cols-5">
          {["Chunk", "Embed", "Store", "Retrieve", "Generate"].map(
            (step, index) => (
              <li
                key={step}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
              >
                <span className="mr-1 font-semibold text-blue-700">
                  {index + 1}.
                </span>
                {step}
              </li>
            ),
          )}
        </ol>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p
            aria-live="polite"
            className={`text-sm ${status.type === "error"
              ? "text-red-600"
              : status.type === "success"
                ? "text-emerald-700"
                : "text-zinc-500"
              }`}
          >
            {status.message}
          </p>

          <button
            type="submit"
            disabled={files.length === 0 || !question.trim() || isSubmitting}
            className="rounded-xl bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isSubmitting ? "Running pipeline…" : "Run RAG pipeline"}
          </button>
        </div>
      </form>

      {result ? (
        <div className="mt-8 border-t border-zinc-200 pt-8">
          <h2 className="text-lg font-semibold text-zinc-950">Answer</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-700">
            {result.answer}
          </p>

          <h3 className="mt-7 text-sm font-semibold text-zinc-950">
            Retrieved context
          </h3>
          {result.sources.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {result.sources.map((source, index) => (
                <li
                  key={`${source.source}-${source.page}-${source.chunk}-${index}`}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                    <span>
                      {source.source} · page {source.page} · chunk {source.chunk}
                    </span>
                    <span>score {source.score.toFixed(3)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-700">
                    {source.text}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">
              No chunks were returned by retrieval.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
