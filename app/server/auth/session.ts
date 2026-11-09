import { cookies } from "next/headers";

import type { User } from "@/types/feedback-types";
import { dataDirectory, getDatabase } from "../db/database";
import { findUserById } from "../db/users-repository";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  loadSessionSecret,
  signSession,
  verifySession,
} from "./session-helper";

let secret: string | null = null;

function sessionSecret(): string {
  secret ??= loadSessionSecret(dataDirectory());
  return secret;
}

export async function currentUser(): Promise<User | null> {
  const userId = verifySession(
    (await cookies()).get(SESSION_COOKIE)?.value,
    sessionSecret(),
  );

  return userId === null ? null : findUserById(getDatabase(), userId);
}

export async function startSession(user: User): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, signSession(user.id, sessionSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export function unauthorized(message = "Sign in with your access code first.") {
  return Response.json({ ok: false, message }, { status: 401 });
}

export function forbidden(message = "Only an admin can do this.") {
  return Response.json({ ok: false, message }, { status: 403 });
}
