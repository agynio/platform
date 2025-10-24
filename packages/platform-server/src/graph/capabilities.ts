// import { JSONSchema } from 'zod/v4/core';

// export interface DynamicConfigurable<Config = Record<string, unknown>> {
//   isDynamicConfigReady(): boolean;
//   getDynamicConfigSchema(): JSONSchema.BaseSchema | undefined;
//   setDynamicConfig(cfg: Config): Promise<void> | void;
//   onDynamicConfigChanged(listener: (cfg: Config) => void): () => void;
// }

// // ---------- Type guards ----------
// export function isDynamicConfigurable<Config = Record<string, unknown>>(
//   obj: unknown,
// ): obj is DynamicConfigurable<Config> {
//   return !!obj && typeof (obj as any).isDynamicConfigReady === 'function';
// }

// Named guards used by runtime (no default export)
export function hasSetConfig(x: unknown): x is { setConfig: (cfg: Record<string, unknown>) => unknown } {
  return !!x && typeof (x as any).setConfig === 'function';
}

export function hasSetDynamicConfig(x: unknown): x is { setDynamicConfig: (cfg: Record<string, unknown>) => unknown } {
  return !!x && typeof (x as any).setDynamicConfig === 'function';
}
