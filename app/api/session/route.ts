import { endSession, startSession } from "@/app/server/auth/session";
import { getDatabase } from "@/app/server/db/database";
import { findUserByAccessCode } from "@/app/server/db/users-repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    code?: unknown;
  } | null;
  const code = typeof body?.code === "string" ? body.code : "";
  const user = code.trim() ? findUserByAccessCode(getDatabase(), code) : null;

  if (!user) {
    return Response.json(
      { ok: false, message: "That access code is not valid." },
      { status: 401 },
    );
  }

  await startSession(user);
  return Response.json({ ok: true, name: user.name });
}

export async function DELETE() {
  await endSession();
  return Response.json({ ok: true });
}
