export type UploadStatus =
  | { type: "idle"; message: "" }
  | { type: "error"; message: string }
  | { type: "success"; message: string };

export type SubmittedDocument = {
  name: string;
  size: number;
  type: string;
};

export type DocumentUploadResponse =
  | {
      ok: true;
      message: string;
      documents: SubmittedDocument[];
    }
  | {
      ok: false;
      message: string;
    };
