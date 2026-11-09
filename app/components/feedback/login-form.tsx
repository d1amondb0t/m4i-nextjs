"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        message?: string;
      };

      if (!result.ok) {
        setError(result.message ?? "That access code is not valid.");
        return;
      }

      // Only follow same-site paths, never another origin.
      router.replace(
        next?.startsWith("/") && !next.startsWith("//") ? next : "/",
      );
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label htmlFor="code" className="block text-sm font-medium text-zinc-900">
        Access code
      </label>
      <input
        id="code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="ABCD-EFGH-JKMN"
        className="w-full rounded-xl border border-zinc-300 px-4 py-3 font-mono text-sm tracking-widest outline-none focus:border-blue-500"
      />
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !code.trim()}
        className="w-full rounded-full bg-blue-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
      >
        {submitting ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
