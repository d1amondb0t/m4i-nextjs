import { Ollama } from "ollama";
import { SearchResult } from "../storage/storage-types";
import { readFileSync } from "fs";
import { GenerationConfiguration } from "@/types/generation-type";
import { getContextLabel } from "@/types/chunk-type";

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

  buildContext(question: string, results: SearchResult[]): string {
    const sections: string[] = [];
    let wordsUsed = 0;

    for(const item of results){
      let text = item.chunk.text;
      const words = text.trim().split(/\s+/);
      const remaining = this.config.maxContextWords - wordsUsed;

      if (remaining <= 0) break;
      const selectedWords = words.slice(0, remaining);
      text = selectedWords.join(" ");

      sections.push(`${getContextLabel(item.chunk)}\n${text}`);
      wordsUsed += selectedWords.length;
    }
    return sections.join("\n\n");
  }

  async generate(question: string, results: SearchResult[]): Promise<string> {

    const response = await this.client.chat({
      model: this.model,
      think: false,
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