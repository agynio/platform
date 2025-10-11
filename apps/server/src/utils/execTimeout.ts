// Helper to detect exec timeout errors consistently across modules
export const EXEC_TIMEOUT_RE = /^Exec timed out after \d+ms/;

export function isExecTimeoutError(err: unknown): err is Error {
  return err instanceof Error && EXEC_TIMEOUT_RE.test(err.message);
}

