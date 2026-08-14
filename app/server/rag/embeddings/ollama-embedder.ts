import { EmbedResponse, Ollama } from "ollama";

export class OllamaEmbedder {
  private readonly client: Ollama;

  constructor(
    private readonly model: string,
    private readonly batchSize: number = 16,
    private readonly queryPrefix:string = "",
    client: Ollama = new Ollama(),
  ) {
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
      throw new RangeError(`batchSize parameter must be a positive integer.`)
    }

    this.client = client;
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    const vectors: number[][] = [];

    for (let start = 0; start < texts.length; start += this.batchSize) {
      const batch = texts.slice(start, start + this.batchSize);
      const response: EmbedResponse = await this.client.embed({
        model: this.model,
        input: batch
      });

      vectors.push(...response.embeddings.map((vector)=>[...vector]));
    }

    return vectors;
  }

  async embedQuery(text:string): Promise<number[]> {
    const vectors = await this.embed([`${this.queryPrefix}${text}`]);
    const vector = vectors[0];

    if(!vector) throw new Error(`${this.model} returned no embeddings for the query`);

    return vector;
  }

}