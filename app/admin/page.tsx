import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "../components/page-header";
import { currentUser } from "../server/auth/session";
import { getDatabase } from "../server/db/database";
import { listUsers } from "../server/db/users-repository";

const EXPORTS = [
  {
    kind: "feedback",
    title: "Feedback",
    description:
      "One row per verdict: accepted and rejected answers, relevant, irrelevant and missed chunks, with comments, scores and models.",
  },
  {
    kind: "chunks",
    title: "Chunks",
    description:
      "Every chunk shown in every run, labelled or not. Use it for reranker pairs.",
  },
  {
    kind: "questions",
    title: "Tester questions",
    description:
      "Every question asked in RAG mode with its closest ontology question, least similar first.",
  },
];

export default async function AdminPage() {
  const user = await currentUser();
  if (!user?.isAdmin) notFound();

  const users = listUsers(getDatabase());

  return (
    <div>
      <PageHeader eyebrow="Admin" title="Export feedback" />
      <ul className="grid gap-3 sm:grid-cols-3">
        {EXPORTS.map((item) => (
          <li key={item.kind}>
            <a
              href={`/api/export/${item.kind}.csv`}
              className="block h-full rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-blue-300"
            >
              <p className="text-sm font-semibold text-zinc-950">
                {item.title}.csv
              </p>
              <p className="mt-2 text-xs leading-5 text-zinc-600">
                {item.description}
              </p>
            </a>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-lg font-semibold text-zinc-950">Users</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Add users with <code>npm run users -- &lt;name&gt;</code>.
      </p>
      <ul className="mt-3 divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white text-sm">
        {users.map((entry) => (
          <li key={entry.id} className="flex justify-between px-5 py-3">
            <span className="text-zinc-900">
              {entry.name}
              {entry.isAdmin ? " (admin)" : ""}
            </span>
            <code className="text-xs text-zinc-500">{entry.collection}</code>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-lg font-semibold text-zinc-950">Experiments</h2>
      <div className="mt-2 flex gap-4 text-sm font-medium">
        <Link href="/dev/rag" className="text-blue-700 hover:text-blue-900">
          RAG tester
        </Link>
        <Link
          href="/dev/hierarchy"
          className="text-blue-700 hover:text-blue-900"
        >
          Hierarchy tester
        </Link>
      </div>
    </div>
  );
}
