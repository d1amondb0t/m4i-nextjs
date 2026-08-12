import { PDFParse } from "pdf-parse";
import { DocumentChunkMetadata, ExtractedPage } from "./chunk-helper";


export type DocumentChunk = {
  chunkId: string;
  documentId: string;
  source: string;
  sourceHash: string;
  page: number;
  number: number;
  text: string;
  metadata: DocumentChunkMetadata;
};

export type DocumentIdentity = {
  documentId: string;
  source: string;
  sourceHash: string;
}

function decodeUtf8(data: Uint8Array, filename:string): string {
  try {
    return new TextDecoder("utf-8", {fatal: true}).decode(data);
  } catch (error){
    throw new Error(`${filename} is not valid UTF-8 text.`, {cause:error});
  }
}


export async function extractFile(file: File, extension: string): Promise<ExtractedPage[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (extension != "pdf") {
    return [{
      page: 1, 
      text: decodeUtf8(bytes, file.name)
    }]
  } else {
    const parser = new PDFParse({data:bytes});

    try {
      const result = await parser.getText();
      return result.pages.map((page) => ({
        page: page.num,
        text: page.text
      }));
    } finally {
      await parser.destroy();
    }
  }
}
