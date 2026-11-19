import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import type { JobUpload } from "@/types/feedback-types";
import { dataDirectory } from "../db/database";

function jobDirectory(jobId: string): string {
  return join(dataDirectory(), "uploads", jobId);
}

export async function saveUploads(
  jobId: string,
  files: readonly File[],
): Promise<JobUpload[]> {
  const directory = jobDirectory(jobId);
  await mkdir(directory, { recursive: true });

  return Promise.all(
    files.map(async (file, index) => {
      // Stored under an index so the original name never reaches the file system.
      const stored = `${index}${extname(file.name)
        .toLowerCase()
        .replace(/[^.a-z0-9]/g, "")}`;
      await writeFile(
        join(directory, stored),
        Buffer.from(await file.arrayBuffer()),
      );
      return { file: stored, name: file.name, type: file.type };
    }),
  );
}

export async function loadUploads(
  jobId: string,
  uploads: readonly JobUpload[],
): Promise<File[]> {
  return Promise.all(
    uploads.map(
      async (upload) =>
        new File(
          [await readFile(join(jobDirectory(jobId), upload.file))],
          upload.name,
          {
            type: upload.type,
          },
        ),
    ),
  );
}

export async function removeUploads(jobId: string): Promise<void> {
  await rm(jobDirectory(jobId), { recursive: true, force: true });
}
