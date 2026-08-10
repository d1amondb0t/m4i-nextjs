"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useState,
} from "react";

const acceptedExtensions = new Set(["pdf", "csv", "docx", "txt", "md", "xlsx"]);
const maxFileCount = 10;
const maxFileSize = 25 * 1024 * 1024;

type UploadStatus =
  | { type: "idle"; message: "" }
  | { type: "error"; message: string }
  | { type: "success"; message: string };

function extensionOf(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFiles(files: File[]) {
  if (files.length > maxFileCount) {
    return `Cannot select more than ${maxFileCount} documents at once.`;
  }

  const unsupportedFile = files.find(
    (file) => !acceptedExtensions.has(extensionOf(file.name)),
  );

  if (unsupportedFile) {
    return `${unsupportedFile.name} is not a supported document type.`;
  }

  const oversizedFile = files.find((file) => file.size > maxFileSize);

  if (oversizedFile) {
    return `${oversizedFile.name} exceeds the 25 MB file limit.`;
  }

  const emptyFile = files.find((file) => file.size === 0);

  if (emptyFile) {
    return `${emptyFile.name} is empty.`;
  }

  return null;
}

export function DocumentUpload() {
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<UploadStatus>({
    type: "idle",
    message: "",
  });

  function handleSelection(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    const validationError = validateFiles(selectedFiles);

    if (validationError) {
      setFiles([]);
      setStatus({ type: "error", message: validationError });
      return;
    }

    setFiles(selectedFiles);
    setStatus({ type: "idle", message: "" });
  }

  function removeFile(index: number) {
    setFiles((currentFiles) =>
      currentFiles.filter((_, currentIndex) => currentIndex !== index),
    );
    setStatus({ type: "idle", message: "" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateFiles(files);

    if (validationError || files.length === 0) {
      setStatus({
        type: "error",
        message: validationError ?? "Select at least one document.",
      });
      return;
    }

    const formData = new FormData();

    for (const file of files) {
      formData.append("documents", file);
    }

    setIsSubmitting(true);
    setStatus({ type: "idle", message: "" });

    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      const result = (await response.json()) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.message ?? "The documents could not be submitted.");
      }

      setStatus({
        type: "success",
        message:
          result.message ??
          `${files.length} document${files.length === 1 ? "" : "s"} submitted.`,
      });
      setFiles([]);
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
            PDF, CSV, DOCX, TXT, XLSX, or MD
          </span>
          <span className="mt-1 text-xs text-zinc-400">
            Up to 10 files, 25 MB each
          </span>

          <input
            id="documents"
            name="documents"
            type="file"
            accept=".pdf,.csv,.docx,.txt,.xlsx,.md"
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
                {files.length} of {maxFileCount}
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

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p
            aria-live="polite"
            className={`text-sm ${
              status.type === "error"
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
            disabled={files.length === 0 || isSubmitting}
            className="rounded-xl bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isSubmitting ? "Submitting…" : "Submit documents"}
          </button>
        </div>
      </form>
    </section>
  );
}