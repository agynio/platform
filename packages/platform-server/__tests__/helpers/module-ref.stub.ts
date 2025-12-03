import type { ModuleRef } from '@nestjs/core';

type ModuleRefOverrides = Partial<Pick<ModuleRef, 'get' | 'create' | 'resolve'>>;

export function createModuleRefStub(overrides: ModuleRefOverrides = {}): ModuleRef {
  const base: ModuleRefOverrides = {
    get: () => undefined,
    create: async () => undefined,
    resolve: async () => undefined,
  };
  return {
    ...base,
    ...overrides,
  } as ModuleRef;
}
