
// const DEFAULT_LANGUAGE_MODEL = "hf.co/bartowski/Llama-3.2-1B-Instruct-GGUF";
// const DEFAULT_LANGUAGE_MODEL = "qwen3.5:9b-q8_0";
const DEFAULT_LANGUAGE_MODEL = "qwen3.5:9b-q4_K_M";

export type GenerationConfiguration = {
  model: string;
  temperature: number;
  prompt: string;
  sentencesPerChunk: number;
  maxContextWords: number;
};

export const DEFAULT_GENERATION_CONFIGURATION = {
  model: DEFAULT_LANGUAGE_MODEL,
  temperature: 0.0,
  prompt: "prompts/grounded.txt",
  sentencesPerChunk: 0,
  maxContextWords: 1200
}