import { PDFParse } from "pdf-parse";
import { getData as getPdfWorkerData } from "pdf-parse/worker";
import type { ExtractedPage } from "@/types/chunk-type";

PDFParse.setWorker(getPdfWorkerData());

export function cleanText(text: string): string {
  return text
    .replace(/\x00/g, " ")
    .replace(/<latexit\b[\s\S]*?<\/latexit>/gi, " ")
    .replace(/(?<=\w)-\r?\n(?=\w)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeUtf8(data: Uint8Array, filename: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch (error) {
    throw new Error(`${filename} is not valid UTF-8 text.`, { cause: error });
  }
}


export async function extractFile(file: File, extension: string): Promise<ExtractedPage[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (extension !== "pdf") {
    return [{
      page: 1,
      text: cleanText(decodeUtf8(bytes, file.name))
    }]
  }

  const parser = new PDFParse({ data: bytes });

  try {
    const result = await parser.getText();
    return result.pages.map((page) => ({
      page: page.num,
      text: cleanText(page.text)
    }));
  } finally {
    await parser.destroy();
  }
}
