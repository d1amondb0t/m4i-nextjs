import { validateRagDocumentSelection } from "@/app/server/documents/upload-policy";
import { parseFrameworkOntology } from "@/app/server/rag/hierarchy/hierarchy-helper";
import { HierarchyPipeline } from "@/app/server/rag/hierarchy/hierarchy-pipeline";
import type { HierarchyPipelineResponse } from "@/types/hierarchy-types";

export const runtime = "nodejs";

function ontologyFromFormData(entry: FormDataEntryValue | null) {
  if (typeof entry !== "string" || !entry.trim()) {
    throw new Error("Provide a framework ontology as JSON.");
  }

  let value: unknown;

  try {
    value = JSON.parse(entry);
  } catch {
    throw new Error("Framework ontology must be valid JSON.");
  }

  return parseFrameworkOntology(value);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const documents = formData
      .getAll("documents")
      .filter((entry): entry is File => entry instanceof File);
    const documentError = validateRagDocumentSelection(documents);

    if (documentError) {
      const response = {
        ok: false,
        message: documentError,
      } satisfies HierarchyPipelineResponse;

      return Response.json(response, { status: 400 });
    }

    let ontology;

    try {
      ontology = ontologyFromFormData(formData.get("ontology"));
    } catch (error) {
      const response = {
        ok: false,
        message: error instanceof Error ? error.message : "Invalid framework ontology.",
      } satisfies HierarchyPipelineResponse;

      return Response.json(response, { status: 400 });
    }

    const result = await new HierarchyPipeline().run(documents, ontology);
    const response = {
      ok: true,
      indexedChunks: result.chunks.length,
      framework: result.framework,
      diagnostics: result.diagnostics,
    } satisfies HierarchyPipelineResponse;

    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const response = {
      ok: false,
      message: `The hierarchy pipeline failed: ${message}`,
    } satisfies HierarchyPipelineResponse;

    return Response.json(response, { status: 500 });
  }
}
