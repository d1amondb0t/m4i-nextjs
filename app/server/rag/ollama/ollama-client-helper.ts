import { Ollama } from "ollama";

const MAX_DETAIL_CHARACTERS = 500;

function requestedModel(init: RequestInit | undefined): string {
  if (typeof init?.body !== "string") return "";
  const { model } = JSON.parse(init.body) as { model?: unknown };
  return typeof model === "string" ? ` for model "${model}"` : "";
}

function connectionFailure(error: unknown): string {
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause instanceof Error) return cause.message || String(cause);
  return error instanceof Error ? error.message : String(error);
}

function shortened(text: string): string {
  return text.length > MAX_DETAIL_CHARACTERS
    ? `${text.slice(0, MAX_DETAIL_CHARACTERS)}… (${text.length} characters)`
    : text;
}

function errorMessage(body: unknown): string | undefined {
  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error === "string")
    return errorMessage(parsedJson(error)) ?? error;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : undefined;
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function responseDetail(response: Response): Promise<string> {
  const text = (await response.text()).trim();
  if (!text) return "the response had no details";
  if (!response.headers.get("content-type")?.includes("application/json"))
    return shortened(text);
  return shortened(errorMessage(JSON.parse(text)) ?? text);
}

export async function fetchWithOllamaContext(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : input);
  const request = `${url.pathname}${requestedModel(init)}`;
  let response: Response;

  try {
    response = await fetch(input, init);
  } catch (error) {
    throw new Error(
      `Could not reach Ollama at ${url.origin} (${request}): ${connectionFailure(error)}. Check that Ollama is running and that OLLAMA_HOST is correct.`,
      { cause: error },
    );
  }

  if (!response.ok) {
    throw Object.assign(
      new Error(
        `Ollama at ${url.origin} returned HTTP ${response.status} ${response.statusText} (${request}): ${await responseDetail(response)}`,
      ),
      { status_code: response.status },
    );
  }

  return response;
}

export function createOllamaClient(host?: string): Ollama {
  return new Ollama({
    ...(host ? { host } : {}),
    fetch: fetchWithOllamaContext,
  });
}
