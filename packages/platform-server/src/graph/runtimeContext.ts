export interface RuntimeContext {
  nodeId: string;
  get: (id: string) => unknown;
}

export interface RuntimeContextAware {
  setRuntimeContext(ctx: RuntimeContext): void;
}

export function isRuntimeContextAware(obj: unknown): obj is RuntimeContextAware {
  return !!obj && typeof (obj as any).setRuntimeContext === 'function';
}
