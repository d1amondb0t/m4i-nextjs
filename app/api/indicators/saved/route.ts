import { adminOnly } from "@/app/server/auth/session";
import {
  listSavedIndicatorRuns,
  readSavedIndicatorRun,
} from "@/app/server/rag/indicators/saved-indicator-runs";
import {
  DEFAULT_INDICATOR_CONFIGURATION,
  type SavedIndicatorRunListResponse,
  type SavedIndicatorRunResponse,
} from "@/types/indicator-types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = await adminOnly();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const variant = searchParams.get("variant");
  const file = searchParams.get("file");

  if (!variant || !file) {
    return Response.json({
      ok: true,
      runs: await listSavedIndicatorRuns(),
    } satisfies SavedIndicatorRunListResponse);
  }

  try {
    return Response.json({
      ok: true,
      gate: DEFAULT_INDICATOR_CONFIGURATION.gate,
      run: await readSavedIndicatorRun(variant, file),
    } satisfies SavedIndicatorRunResponse);
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: (error as Error).message,
      } satisfies SavedIndicatorRunResponse,
      { status: 404 },
    );
  }
}
