// Helper to detect exec timeout errors consistently across modules
export const EXEC_TIMEOUT_RE = /^Exec timed out after \d+ms/;
export const EXEC_IDLE_TIMEOUT_RE = /^Exec idle timed out after \d+ms/;

/**
 * Error thrown when an exec operation exceeds the provided timeout.
 * Carries timeoutMs and any captured stdout/stderr up to the point of timeout.
 */
export class ExecTimeoutError extends Error {
  timeoutMs: number;
  stdout: string;
  stderr: string;
  constructor(timeoutMs: number, stdout: string, stderr: string) {
    super(`Exec timed out after ${timeoutMs}ms`);
    this.name = 'ExecTimeoutError';
    this.timeoutMs = timeoutMs;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

export function isExecTimeoutError(err: unknown): err is Error {
  return (
    err instanceof ExecTimeoutError ||
    (err instanceof Error && EXEC_TIMEOUT_RE.test(err.message))
  );
}

/**
 * Error thrown when an exec operation produces no output for idleTimeoutMs.
 * Carries timeoutMs and any captured stdout/stderr up to the point of timeout.
 */
export class ExecIdleTimeoutError extends Error {
  timeoutMs: number;
  stdout: string;
  stderr: string;
  constructor(timeoutMs: number, stdout: string, stderr: string) {
    super(`Exec idle timed out after ${timeoutMs}ms`);
    this.name = 'ExecIdleTimeoutError';
    this.timeoutMs = timeoutMs;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

export function isExecIdleTimeoutError(err: unknown): err is Error {
  return (
    err instanceof ExecIdleTimeoutError ||
    (err instanceof Error && EXEC_IDLE_TIMEOUT_RE.test(err.message))
  );
}
