import { vi } from 'vitest';

import type { ReferenceResolverService } from '../../src/utils/reference-resolver.service';

type ResolutionCounts = {
  total: number;
  resolved: number;
  unresolved: number;
  cacheHits: number;
  errors: number;
};

const DEFAULT_COUNTS: ResolutionCounts = {
  total: 0,
  resolved: 0,
  unresolved: 0,
  cacheHits: 0,
  errors: 0,
};

export function createReferenceResolverStub() {
  const resolve = vi.fn(async <T>(input: T) => ({
    output: input,
    report: { events: [], counts: { ...DEFAULT_COUNTS } },
  }));
  const stub = { resolve } as unknown as ReferenceResolverService;
  return { stub, resolve };
}
