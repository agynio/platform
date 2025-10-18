// NodeLifecycle interface and guard
export interface NodeLifecycle<Config = Record<string, unknown>> {
  configure(cfg: Config): Promise<void> | void;
  start(): Promise<void> | void;
  stop(): Promise<void> | void;
  delete(): Promise<void> | void;
}

export function isNodeLifecycle(obj: unknown): obj is NodeLifecycle<any> {
  return !!obj && typeof (obj as any).configure === 'function';
}

