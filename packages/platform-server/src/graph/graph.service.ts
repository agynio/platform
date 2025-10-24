import type {
  PersistedGraph,
  PersistedGraphUpsertRequest,
  PersistedGraphUpsertResponse,
} from './types';

export type GraphAuthor = { name?: string; email?: string };

// Abstract token for DI and implementation unification.
export abstract class GraphService {
  abstract initIfNeeded(): Promise<void>;
  abstract get(name: string): Promise<PersistedGraph | null>;
  abstract upsert(req: PersistedGraphUpsertRequest, author?: GraphAuthor): Promise<PersistedGraphUpsertResponse>;
  abstract upsertNodeState(name: string, nodeId: string, patch: Record<string, unknown>): Promise<void>;
}

