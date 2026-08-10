const acceptedExtensions = new Set(["pdf", "csv", "docx", "txt", "md", "xlsx"]);
const maxFileCount = 10;
const maxFileSize = 25 * 1024 * 1024;

function extensionOf(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export async function POST(request:Request) {
  const formData = await request.formData();
  const entries = formData.getAll("documents");
  const documents = entries.filter(
    (entry): entry is File => entry instanceof File,
  );

  if (documents.length === 0) {
    return Response.json(
      {message: `Select at minimum one document.`},
      {status: 400},
    );
  }

  if (documents.length > maxFileCount) {
    return Response.json(
      {message: `Cannot submit more than ${maxFileCount}.`},
      {status: 400},
    )
  }

  for (const document of documents) {
    if (!acceptedExtensions.has(extensionOf(document.name))) {
      return Response.json(
        {message: `${document.name} is not a supported document type`},
        {status: 400},
      )
    }

    if (document.size === 0) {
      return Response.json(
        {message: `${document.name} cannot be empty.`},
        {status: 400},
      )
    }

    if (document.size > maxFileSize) {
      return Response.json(
        {message: `${document.name} cannot surpass the maximum file size of ${maxFileSize}`},
        {status: 400},
      )
    }
  }

  return Response.json({
    message: `${documents.length} document${
      documents.length === 1 ? "" : "s"
    } received and validated.`,
    documents: documents.map((document) => ({
      name: document.name,
      size: document.size,
      type: document.type,
    })),
  });
}