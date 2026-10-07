import { validateRagDocumentSelection } from "@/app/server/documents/upload-policy";
import {
  CalibrationPipeline,
  calibrationConfiguration,
} from "@/app/server/rag/retrieval/calibration-pipeline";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const documents = form
      .getAll("documents")
      .filter((entry): entry is File => entry instanceof File);
    const documentError = validateRagDocumentSelection(documents);
    if (documentError)
      return Response.json(
        { ok: false, message: documentError },
        { status: 400 },
      );
    const questionsRaw = form.get("questions");
    const configurationRaw = form.get("configuration");
    let questions: unknown;
    let configuration: unknown;
    try {
      questions = JSON.parse(
        typeof questionsRaw === "string" ? questionsRaw : "null",
      );
      configuration =
        configurationRaw === null
          ? {}
          : JSON.parse(
              typeof configurationRaw === "string" ? configurationRaw : "null",
            );
    } catch {
      return Response.json(
        {
          ok: false,
          message: "Questions and configuration must be valid JSON.",
        },
        { status: 400 },
      );
    }
    if (
      !Array.isArray(questions) ||
      questions.length === 0 ||
      !questions.every((value) => typeof value === "string")
    ) {
      return Response.json(
        {
          ok: false,
          message: "questions must be a non-empty array of strings.",
        },
        { status: 400 },
      );
    }
    let options;
    try {
      options = calibrationConfiguration(configuration);
    } catch (error) {
      return Response.json(
        {
          ok: false,
          message:
            error instanceof Error ? error.message : "Invalid configuration.",
        },
        { status: 400 },
      );
    }
    const result = await new CalibrationPipeline(options).run(
      documents,
      questions,
    );
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: `Calibration retrieval failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 },
    );
  }
}
