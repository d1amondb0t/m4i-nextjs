import { validateRagDocumentSelection } from "@/app/server/documents/upload-policy";
import { RagPipeline } from "@/app/server/rag/pipeline/rag-pipeline";
import type { RagPipelineResponse } from "@/types/rag-pipeline-type";
import { validateQuestion } from "@/types/rag-pipeline-type";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const documents = formData
      .getAll("documents")
      .filter((entry): entry is File => entry instanceof File);
    const questionEntry = formData.get("question");
    const question = typeof questionEntry === "string" ? questionEntry : "";
    const documentError = validateRagDocumentSelection(documents);
    const questionError = validateQuestion(question);

    if (documentError || questionError) {
      const response = {
        ok: false,
        message: documentError ?? questionError ?? "Invalid pipeline input.",
      } satisfies RagPipelineResponse;

      return Response.json(response, { status: 400 });
    }

    const result = await new RagPipeline().run(documents, question);
    const response = {
      ok: true,
      answer: result.answer,
      indexedChunks: result.chunks.length,
      sources: result.results.map(({ chunk, score }) => ({
        source: chunk.source,
        page: chunk.page,
        chunk: chunk.number,
        score,
        text: chunk.text,
      })),
    } satisfies RagPipelineResponse;

    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const response = {
      ok: false,
      message: `The RAG pipeline failed: ${message}`,
    } satisfies RagPipelineResponse;

    return Response.json(response, { status: 500 });
  }
}
