import { validateDocumentSelection } from "@/app/server/documents/upload-policy";
import type { DocumentUploadResponse } from "@/types/document-upload";

export async function POST(request: Request) {
  const formData = await request.formData();
  const entries = formData.getAll("documents");
  const documents = entries.filter(
    (entry): entry is File => entry instanceof File,
  );
  const validationError = validateDocumentSelection(documents);

  if (validationError) {
    const response = {
      ok: false,
      message: validationError,
    } satisfies DocumentUploadResponse;

    return Response.json(response, { status: 400 });
  }

  const response = {
    ok: true,
    message: `${documents.length} document${
      documents.length === 1 ? "" : "s"
    } received and validated.`,
    documents: documents.map((document) => ({
      name: document.name,
      size: document.size,
      type: document.type,
    })),
  } satisfies DocumentUploadResponse;

  return Response.json(response);
}
