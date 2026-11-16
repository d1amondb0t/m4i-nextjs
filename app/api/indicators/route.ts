import { adminOnly } from "@/app/server/auth/session";
import { validateRagDocumentSelection } from "@/app/server/documents/upload-policy";
import { HierarchyPipeline } from "@/app/server/rag/hierarchy/hierarchy-pipeline";
import { loadIndicatorOntology } from "@/app/server/rag/indicators/indicator-ontology-source";
import { createIndicatorPipeline } from "@/app/server/rag/indicators/indicator-pipeline";
import { ragPipelineConfigurationFromEnvironment } from "@/app/server/rag/pipeline/rag-pipeline-helper";
import {
  DEFAULT_INDICATOR_CONFIGURATION,
  type IndicatorRunResponse,
} from "@/types/indicator-types";

export const runtime = "nodejs";

function seconds(start: number): number {
  return Math.round((performance.now() - start) / 100) / 10;
}

export async function POST(request: Request) {
  const denied = await adminOnly();
  if (denied) return denied;

  const documents = (await request.formData())
    .getAll("documents")
    .filter((entry): entry is File => entry instanceof File);
  const documentError = validateRagDocumentSelection(documents);
  if (documentError) {
    return Response.json(
      { ok: false, message: documentError } satisfies IndicatorRunResponse,
      { status: 400 },
    );
  }

  try {
    const ontology = loadIndicatorOntology();
    const configuration = ragPipelineConfigurationFromEnvironment();
    let start = performance.now();
    const hierarchy = await new HierarchyPipeline(configuration).run(
      documents,
      ontology,
    );
    const hierarchySeconds = seconds(start);
    start = performance.now();
    const result = await createIndicatorPipeline(configuration).run(
      ontology,
      hierarchy,
    );

    return Response.json({
      ok: true,
      indexedChunks: hierarchy.chunks.length,
      gate: DEFAULT_INDICATOR_CONFIGURATION.gate,
      result,
      seconds: { hierarchy: hierarchySeconds, indicators: seconds(start) },
    } satisfies IndicatorRunResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      {
        ok: false,
        message: `The indicator pipeline failed: ${message}`,
      } satisfies IndicatorRunResponse,
      { status: 500 },
    );
  }
}
