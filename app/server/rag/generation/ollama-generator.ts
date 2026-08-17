import { Ollama } from "ollama";
import { SearchResult } from "../storage/storage-types";
import { readFileSync } from "fs";
import { GenerationConfiguration } from "@/types/generation-type";
import { getContextLabel } from "@/types/chunk-type";

const TOKEN_PATTERN = /[A-Za-z0-9]+/g;

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(TOKEN_PATTERN) ?? [];
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
  let size = 0;

  for (const term of left) {
    if (right.has(term)) {
      size++;
    }
  }

  return size;
};

function splitWords(text: string): string[] {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}


export class OllamaGenerator {
  private readonly client: Ollama;
  private readonly systemPrompt: string;

  constructor(
    private readonly model: string,
    private readonly promptPath: string,
    private readonly config: GenerationConfiguration,
    client: Ollama = new Ollama(),
  ) {
    this.client = client;
    this.systemPrompt = readFileSync(promptPath, "utf-8");
  };


  _compress(question: string, text: string): string {
    const count = this.config.sentencesPerChunk;

    if (count === 0) {
      return text;
    }

    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (sentences.length <= count) {
      return text;
    }

    const stopwords = new Set([
      "a",
      "an",
      "and",
      "are",
      "do",
      "does",
      "during",
      "how",
      "in",
      "is",
      "of",
      "the",
      "to",
      "what",
      "which",
    ]);

    const query_terms = new Set(
      tokenize(question).filter((term) => !stopwords.has(term)),
    );

    const ranked = sentences
      .map((sentence, index) => ({
        index,
        sentence,
        score: intersectionSize(
          query_terms,
          new Set(tokenize(sentence)),
        ),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, count);

    const focus_window = (sentence: string, size = 90): string => {
      const words = splitWords(sentence);

      if (words.length <= size) {
        return sentence;
      }

      let best_start = 0;
      let best_score = -1;

      for (let start = 0; start <= words.length - size; start += 10) {
        const window = words.slice(start, start + size).join(" ");
        const score = intersectionSize(
          query_terms,
          new Set(tokenize(window)),
        );

        if (score > best_score) {
          best_start = start;
          best_score = score;
        }
      }

      return words.slice(best_start, best_start + size).join(" ");
    };

    return ranked
      .sort((left, right) => left.index - right.index)
      .map(({ sentence }) => focus_window(sentence))
      .join(" ");
  }

  buildContext(question: string, results: SearchResult[]): string {
    const sections: string[] = [];
    let wordsUsed = 0;

    for(const item of results){
      let text = item.chunk.text;
      const words = text.trim().split(/\s+/);
      const remaining = this.config.maxContextWords - wordsUsed;

      if (remaining <= 0) break;
      const selectedWords = words.slice(remaining);
      text = selectedWords.join(" ");

      sections.push(`${getContextLabel(item.chunk)}\n${text}`);
      wordsUsed += selectedWords.length;
    }
    return sections.join("\n\n");
  }

  async generate(question: string, results: SearchResult[]): Promise<string> {

    const response = await this.client.chat({
      model: this.model,
      messages: [
        {"role": "system", "content": this.systemPrompt},
        {"role": "user", "content": `Question:\n${question}\n\nContext:\n${this.buildContext(question, results)}`},
      ],
      options: {"temperature": this.config.temperature}
    });

    const answer = response.message.content;

    return answer;
  }
}