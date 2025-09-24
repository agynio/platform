/*
  Runtime capability foundation types (shared across server, agents, tools, triggers, MCP, etc.)

  ConfigSchema
  - Uses JSON Schema Draft 2020-12 via Ajv's type definitions
  - We intentionally type this as `import('ajv').AnySchema` to align with Ajv typings while
    remaining agnostic of Ajv runtime usage. This is a type-only dependency.

  Capability interfaces
  - StaticConfigurable: for configuration that is provided up front (e.g., via graph definition)
    and does not change at runtime. Implementations should expose their JSON Schema for static
    configuration via getStaticConfigSchema, and accept config via setConfig.
  - DynamicConfigurable: for configuration that may change at runtime (e.g., via UI while the
    node is running). Implementations should indicate readiness (isDynamicConfigReady), provide a
    schema via getDynamicConfigSchema, accept updates via setDynamicConfig, and optionally notify
    consumers when the schema changes.
  - Provisionable: for components that require external resources (e.g., creating a webhook,
    registering with a service, warming a model). Implementations report current provisioning
    state and can expose lifecycle methods provision/deprovision along with an optional
    onProvisionStateChange subscription.
  - Pausable: simple pause/resume contract with an isPaused query to support orchestration and
    maintenance operations.

  Notes
  - These are foundational contracts only; no runtime behavior is introduced here. Concrete nodes
    may implement any subset that applies. Server graph types remain unchanged in this iteration.
*/

export type ConfigSchema = import('ajv').AnySchema;

/**
 * Provisioning lifecycle high-level states for nodes that manage external resources.
 */
export enum ProvisionState {
  NOT_READY = 'NOT_READY',
  PROVISIONING = 'PROVISIONING',
  READY = 'READY',
  ERROR = 'ERROR',
  DEPROVISIONING = 'DEPROVISIONING',
}

/**
 * Additional details for the current provisioning state.
 * - since: ISO timestamp when the state was entered
 * - message: optional human-readable message (status, warnings)
 * - error: optional error object when in ERROR state
 * - meta: optional structured diagnostics/metadata for UI or logging
 */
export type ProvisionStateDetails = {
  since: string;
  message?: string;
  error?: unknown;
  meta?: Record<string, unknown>;
};

/**
 * Static configuration provided at construction/build time and not expected to change at runtime.
 * Implementations should validate provided config against the returned JSON Schema (Draft 2020-12).
 */
export interface StaticConfigurable<T = Record<string, unknown>> {
  /** Apply the static configuration. May be synchronous or asynchronous. */
  setConfig(cfg: T): void | Promise<void>;
  /** Return the JSON Schema for static configuration. */
  getStaticConfigSchema(): ConfigSchema | Promise<ConfigSchema>;
}

/**
 * Provisionable capability for components that manage external resources.
 * Implementations should always report a state and may expose lifecycle methods.
 */
export interface Provisionable {
  /** Current provisioning state, optionally with details for UI/diagnostics. */
  getProvisionState(): { state: ProvisionState; details?: ProvisionStateDetails };
  /** Optional explicit provisioning action. Implement only if meaningful. */
  provision?(): Promise<void>;
  /** Optional explicit deprovisioning action. Implement only if meaningful. */
  deprovision?(): Promise<void>;
  /** Optional subscription for provisioning state changes. */
  onProvisionStateChange?(cb: (s: { state: ProvisionState; details?: ProvisionStateDetails }) => void): void;
}

/**
 * Dynamic configuration that may evolve while a node is running (e.g., live config UIs).
 * Implementations should expose readiness and a JSON Schema for dynamic config.
 */
export interface DynamicConfigurable<T = Record<string, unknown>> {
  /** Whether the dynamic configuration system is currently ready (e.g., schema loaded). */
  isDynamicConfigReady(): boolean;
  /** Return the JSON Schema for dynamic configuration (Draft 2020-12). */
  getDynamicConfigSchema(): ConfigSchema | Promise<ConfigSchema>;
  /** Apply an updated dynamic configuration. */
  setDynamicConfig(cfg: T): void | Promise<void>;
  /** Optional notification when the dynamic config schema changes at runtime. */
  onDynamicConfigSchemaChanged?(cb: (schema: ConfigSchema) => void): void;
}

/**
 * Pause/resume capability for operational control and maintenance windows.
 */
export interface Pausable {
  pause(): Promise<void>;
  resume(): Promise<void>;
  isPaused(): boolean;
}
