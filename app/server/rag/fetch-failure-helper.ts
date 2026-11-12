export function fetchFailureCause(error: unknown): string | undefined {
  const cause = error instanceof Error ? error.cause : undefined;
  return cause instanceof Error ? cause.message || String(cause) : undefined;
}
