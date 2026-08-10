export type UploadStatus =
  | { type: "idle"; message: "" }
  | { type: "error"; message: string }
  | { type: "success"; message: string };

