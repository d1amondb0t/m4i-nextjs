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
            Submit Documents
          </h1>
          <p className="mt-5 text-base leading-7 text-zinc-600 sm:text-lg">
            Start by submitting the documents relevant to the project context.
          </p>
        </header>

        <DocumentUpload />
      </div>
    </main>
  );
}
