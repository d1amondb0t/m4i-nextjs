import { QdrantClient } from "@qdrant/js-client-rest";

import { isCloudInstance } from "./storage-helper";
import type { StorageConfiguration } from "./storage-types";

type QdrantHttpError = Error & {
  status: number;
  statusText: string;
  data?: unknown;
};

function qdrantEndpoint(config: StorageConfiguration): string {
  return isCloudInstance(config)
    ? config.url
    : `http://${config.host}:${config.port}`;
}

function isHttpError(error: unknown): error is QdrantHttpError {
  return (
    error instanceof Error &&
    typeof (error as QdrantHttpError).status === "number"
  );
}

function httpDetail(error: QdrantHttpError): string {
  const data = error.data as { status?: { error?: unknown } } | undefined;
  const detail = data?.status?.error;
  if (typeof detail === "string") return detail;
  return data ? JSON.stringify(data) : "the response had no details";
}

function connectionFailure(error: Error): string | undefined {
  return error instanceof TypeError && error.cause instanceof Error
    ? error.cause.message || String(error.cause)
    : undefined;
}

function qdrantError(error: unknown, endpoint: string, request: string): Error {
  if (!(error instanceof Error)) return new Error(String(error));

  if (isHttpError(error)) {
    return Object.assign(
      new Error(
        `Qdrant at ${endpoint} returned HTTP ${error.status} ${error.statusText} (${request}): ${httpDetail(error)}`,
        { cause: error },
      ),
      { status: error.status },
    );
  }

  const unreachable = connectionFailure(error);
  return new Error(
    unreachable
      ? `Could not reach Qdrant at ${endpoint} (${request}): ${unreachable}. Check that Qdrant is running and that QDRANT_URL, or QDRANT_HOST and QDRANT_PORT, are correct.`
      : `Qdrant at ${endpoint} failed (${request}): ${error.message}`,
    { cause: error },
  );
}

function describeRequest(method: string, args: readonly unknown[]): string {
  return typeof args[0] === "string"
    ? `${method} on collection "${args[0]}"`
    : method;
}

export function createQdrantClient(config: StorageConfiguration): QdrantClient {
  const endpoint = qdrantEndpoint(config);

  return new Proxy(new QdrantClient(config), {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;

      return (...args: unknown[]) => {
        const result: unknown = value.apply(target, args);
        return result instanceof Promise
          ? result.catch((error: unknown) => {
              throw qdrantError(
                error,
                endpoint,
                describeRequest(String(property), args),
              );
            })
          : result;
      };
    },
  });
}
