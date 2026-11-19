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
  const claims = verifySession(
    (await cookies()).get(SESSION_COOKIE)?.value,
    sessionSecret(),
  );
  if (!claims) return null;

  // A new access code bumps the version, which signs out older sessions.
  const user = findUserById(getDatabase(), claims.userId);
  return user?.sessionVersion === claims.version ? user : null;
}

export async function startSession(user: User): Promise<void> {
  const value = signSession(user.id, user.sessionVersion, sessionSecret());
  (await cookies()).set(SESSION_COOKIE, value, {
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

export async function adminOnly(): Promise<Response | null> {
  const user = await currentUser();
  if (!user) return unauthorized();
  return user.isAdmin ? null : forbidden();
}

export function unauthorized(message = "Sign in with your access code first.") {
  return Response.json({ ok: false, message }, { status: 401 });
}

export function forbidden(message = "Only an admin can do this.") {
  return Response.json({ ok: false, message }, { status: 403 });
}
