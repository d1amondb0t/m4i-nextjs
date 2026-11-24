import { Suspense } from "react";

import { LoginForm } from "../components/feedback/login-form";

export default function LoginPage() {
  return (
    <div className="mx-auto mt-10 max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
        M4I
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-zinc-950">Sign in</h1>
      <p className="mt-2 mb-6 text-sm leading-6 text-zinc-600">
        Enter the access code you were given.
      </p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
