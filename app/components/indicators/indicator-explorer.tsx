"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import {
  RAG_DOCUMENT_INPUT_ACCEPT,
  RAG_DOCUMENT_TYPE_LABEL,
  validateRagDocumentSelection,
} from "@/app/server/documents/upload-policy";
import type {
  IndicatorPipelineResult,
  IndicatorRunResponse,
  MatchGate,
  SavedIndicatorRunListResponse,
  SavedIndicatorRunResponse,
} from "@/types/indicator-types";

import { IndicatorResults } from "./indicator-results";

type Shown = { result: IndicatorPipelineResult; gate: MatchGate; note: string };
type SavedRuns = Extract<SavedIndicatorRunListResponse, { ok: true }>["runs"];

const PREFERRED_VARIANT = "baseline";

function SavedRunPicker({
  onShow,
}: {
  onShow: (shown: Shown | null, error?: string) => void;
}) {
  const [runs, setRuns] = useState<SavedRuns>([]);
  const [variant, setVariant] = useState("");
  const [file, setFile] = useState("");

  useEffect(() => {
    fetch("/api/indicators/saved")
      .then(
        (response) => response.json() as Promise<SavedIndicatorRunListResponse>,
      )
      .then((body) => {
        if (!body.ok) return onShow(null, body.message);
        setRuns(body.runs);
        const first =
          body.runs.find((run) => run.variant === PREFERRED_VARIANT) ??
          body.runs[0];
        if (first) {
          setVariant(first.variant);
          setFile(first.files[0] ?? "");
        }
      });
  }, [onShow]);

  useEffect(() => {
    if (!variant || !file) return;
    const params = new URLSearchParams({ variant, file });
    fetch(`/api/indicators/saved?${params}`)
      .then((response) => response.json() as Promise<SavedIndicatorRunResponse>)
      .then((body) =>
        body.ok
          ? onShow({
              result: body.run,
              gate: body.gate,
              note: `Saved experiment run · ${body.run.variant} · ${body.run.file} · ${body.run.seconds}s for the indicator stage`,
            })
          : onShow(null, body.message),
      );
  }, [variant, file, onShow]);

  const files = runs.find((run) => run.variant === variant)?.files ?? [];

  if (runs.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No saved runs. Run the experiment harness first (see
        experiments/political-indicators/README.md).
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-zinc-900">
        Variant
        <select
          value={variant}
          onChange={(event) => {
            const next = runs.find((run) => run.variant === event.target.value);
            setVariant(event.target.value);
            if (next && !next.files.includes(file))
              setFile(next.files[0] ?? "");
          }}
          className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm"
        >
          {runs.map((run) => (
            <option key={run.variant} value={run.variant}>
              {run.variant}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-zinc-900">
        Document
        <select
          value={file}
          onChange={(event) => setFile(event.target.value)}
          className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm"
        >
          {files.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function NewRunForm({
  onShow,
}: {
  onShow: (shown: Shown | null, error?: string) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateRagDocumentSelection(files);
    if (error) return onShow(null, error);

    const formData = new FormData();
    for (const document of files) formData.append("documents", document);
    setRunning(true);
    onShow(null);
    try {
      const response = await fetch("/api/indicators", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as IndicatorRunResponse;
      if (!body.ok) return onShow(null, body.message);
      onShow({
        result: body.result,
        gate: body.gate,
        note: `New run · ${files.map((document) => document.name).join(", ")} · ${body.indexedChunks} chunks · hierarchy ${body.seconds.hierarchy}s · indicators ${body.seconds.indicators}s`,
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className="text-sm text-zinc-500">
        {RAG_DOCUMENT_TYPE_LABEL}. Runs the political hierarchy questions and
        then the indicator step. Expect a few minutes per document.
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="file"
          accept={RAG_DOCUMENT_INPUT_ACCEPT}
          multiple
          disabled={running}
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          className="block w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm text-zinc-700 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-950 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
        />
        <button
          type="submit"
          disabled={files.length === 0 || running}
          className="shrink-0 rounded-xl bg-zinc-950 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {running ? "Running…" : "Run indicators"}
        </button>
      </div>
    </form>
  );
}

export function IndicatorExplorer() {
  const [mode, setMode] = useState<"saved" | "new">("saved");
  const [shown, setShown] = useState<Shown | null>(null);
  const [error, setError] = useState("");

  const show = useCallback((next: Shown | null, message = "") => {
    setShown(next);
    setError(message);
  }, []);

  return (
    <>
      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
        <div
          role="tablist"
          className="mb-5 inline-flex rounded-xl bg-zinc-100 p-1 text-sm"
        >
          {(
            [
              ["saved", "Saved experiment runs"],
              ["new", "Run a new document"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={mode === value}
              onClick={() => {
                setMode(value);
                show(null);
              }}
              className={`rounded-lg px-3 py-1.5 font-medium ${mode === value ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "saved" ? (
          <SavedRunPicker onShow={show} />
        ) : (
          <NewRunForm onShow={show} />
        )}
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {shown ? (
          <p className="mt-4 text-xs text-zinc-500">{shown.note}</p>
        ) : null}
      </section>

      {shown ? (
        <IndicatorResults result={shown.result} gate={shown.gate} />
      ) : null}
    </>
  );
}
