import type {
  PersistedGraph,
  PersistedGraphUpsertRequest,
  PersistedGraphUpsertResponse,
} from './types';

export type GraphAuthor = { name?: string; email?: string };

// Abstract repository token for DI and implementation unification.
export abstract class GraphRepository {
  abstract initIfNeeded(): Promise<void>;
  abstract get(name: string): Promise<PersistedGraph | null>;
  abstract upsert(req: PersistedGraphUpsertRequest, author?: GraphAuthor): Promise<PersistedGraphUpsertResponse>;
  abstract upsertNodeState(name: string, nodeId: string, patch: Record<string, unknown>): Promise<void>;
  // Variables management (stubs to implement per store)
  abstract getVariables(name: string): Promise<{ items: { key: string; source: 'vault' | 'graph' | 'local'; value?: string; vaultRef?: string }[] } | null>;
  abstract upsertVariables(
    name: string,
    items: { key: string; source: 'vault' | 'graph' | 'local'; value?: string; vaultRef?: string }[],
    expectedVersion?: number,
  ): Promise<PersistedGraphUpsertResponse>;
}
