import type { SearchResult } from "../storage/storage-types";

export type QuestionRetrieval = {
  question: string;
  results: SearchResult[];
};
