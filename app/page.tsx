import { DocumentUpload } from "./components/document-upload";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50 px-5 py-12 sm:px-8 lg:py-20">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
            M4I
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
            Test the RAG pipeline
          </h1>
          <p className="mt-5 text-base leading-7 text-zinc-600 sm:text-lg">
            Upload implemented document types, ask a question, and run every
            stage from chunking through grounded generation.
          </p>
        </header>

        <DocumentUpload />
      </div>
    </main>
  );
}
