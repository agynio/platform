/**
 * Unified Node lifecycle interface used by the runtime and HTTP API.
 *
 * Allowed states and idempotency contract:
 * - Created: instance is constructed by a template factory.
 * - Configured: zero or more configure() calls may occur at any time; they must be idempotent.
 * - Started: start() transitions the node into active state; calling start() when already started is a no-op.
 * - Stopped: stop() transitions the node into inactive state; calling stop() when already stopped is a no-op.
 * - Deleted: delete() performs final cleanup; delete() should be idempotent and terminal (no subsequent start()).
 *
 * Notes:
 * - Factories must be pure: they must only construct and return an instance implementing this interface.
 *   No lifecycle side effects (no auto-start) are allowed inside factories.
 * - Runtime may call configure() immediately after instantiation if static config exists, but will not auto-start.
 */
export interface NodeLifecycle {
  /** Apply static configuration. Must be safe to call multiple times. */
  configure?(cfg: Record<string, unknown>): Promise<void> | void;
  /** Start the node (idempotent). */
  start?(): Promise<void> | void;
  /** Stop the node (idempotent). */
  stop?(): Promise<void> | void;
  /** Final cleanup; idempotent and terminal. */
  delete?(): Promise<void> | void;
}

