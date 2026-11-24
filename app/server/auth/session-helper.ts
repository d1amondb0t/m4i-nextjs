import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SESSION_COOKIE = "m4i_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export type SessionClaims = {
  userId: number;
  version: number;
  issuedAt: number;
};

function payload({ userId, version, issuedAt }: SessionClaims): string {
  return `${userId}.${version}.${issuedAt}`;
}

function signature(claims: SessionClaims, secret: string): string {
  return createHmac("sha256", secret)
    .update(`user:${payload(claims)}`)
    .digest("base64url");
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function signSession(
  userId: number,
  version: number,
  secret: string,
  issuedAt = nowInSeconds(),
): string {
  const claims = { userId, version, issuedAt };
  return `${payload(claims)}.${signature(claims, secret)}`;
}

export function verifySession(
  value: string | undefined,
  secret: string,
  now = nowInSeconds(),
): SessionClaims | null {
  const match = /^(\d+)\.(\d+)\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(value ?? "");
  if (!match) return null;

  const claims = {
    userId: Number(match[1]),
    version: Number(match[2]),
    issuedAt: Number(match[3]),
  };
  const expected = Buffer.from(signature(claims, secret));
  const received = Buffer.from(match[4]);
  const signed =
    expected.length === received.length && timingSafeEqual(expected, received);
  const fresh =
    claims.issuedAt <= now && now - claims.issuedAt < SESSION_MAX_AGE_SECONDS;

  return signed && fresh ? claims : null;
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
