import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SESSION_COOKIE = "m4i_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

function signature(userId: number, secret: string): string {
  return createHmac("sha256", secret)
    .update(`user:${userId}`)
    .digest("base64url");
}

export function signSession(userId: number, secret: string): string {
  return `${userId}.${signature(userId, secret)}`;
}

export function verifySession(
  value: string | undefined,
  secret: string,
): number | null {
  const match = /^(\d+)\.([A-Za-z0-9_-]+)$/.exec(value ?? "");
  if (!match) return null;

  const userId = Number(match[1]);
  const expected = Buffer.from(signature(userId, secret));
  const received = Buffer.from(match[2]);

  return expected.length === received.length &&
    timingSafeEqual(expected, received)
    ? userId
    : null;
}

export function loadSessionSecret(directory: string): string {
  const fromEnvironment = process.env.SESSION_SECRET?.trim();
  if (fromEnvironment) return fromEnvironment;

  // Keep the generated secret with the database so sessions survive restarts.
  const path = join(directory, "session-secret");
  if (!existsSync(path)) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(path, randomBytes(32).toString("base64url"), { mode: 0o600 });
  }

  return readFileSync(path, "utf8").trim();
}
