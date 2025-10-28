// Node interface and guard
export interface Node<Config = Record<string, unknown>> {
  configure(cfg: Config): Promise<void> | void;
  start(): Promise<void> | void;
  stop(): Promise<void> | void;
  delete(): Promise<void> | void;
}

export function isNodeLifecycle(obj: unknown): obj is Node<Record<string, unknown>> {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o['configure'] === 'function' &&
    typeof o['start'] === 'function' &&
    typeof o['stop'] === 'function' &&
    typeof o['delete'] === 'function'
  );
}
