/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from 'react';

import { memoryApi } from '@/api/modules/memory';
import { normalizeMemoryPath } from './path';

type MemoryDataApi = typeof memoryApi;

const MemoryDataContext = createContext<MemoryDataApi>(memoryApi);

export interface MemoryDataProviderProps {
  children: ReactNode;
  api?: MemoryDataApi;
}

export function MemoryDataProvider({ children, api = memoryApi }: MemoryDataProviderProps) {
  return <MemoryDataContext.Provider value={api}>{children}</MemoryDataContext.Provider>;
}

export function useMemoryData(): MemoryDataApi {
  return useContext(MemoryDataContext);
}

const threadKey = (threadId?: string | null) => (threadId == null || threadId === '' ? null : threadId);

const listScopeKey = (nodeId: string, scope: 'global' | 'perThread', threadId: string | undefined) =>
  ['memory', 'list', nodeId, scope, threadKey(threadId)] as const;

const statScopeKey = (nodeId: string, scope: 'global' | 'perThread', threadId: string | undefined) =>
  ['memory', 'stat', nodeId, scope, threadKey(threadId)] as const;

const readScopeKey = (nodeId: string, scope: 'global' | 'perThread', threadId: string | undefined) =>
  ['memory', 'read', nodeId, scope, threadKey(threadId)] as const;

export const memoryQueryKeys = {
  docs: () => ['memory', 'docs'] as const,
  listScope: listScopeKey,
  list: (nodeId: string, scope: 'global' | 'perThread', threadId: string | undefined, path: string) => [
    ...listScopeKey(nodeId, scope, threadId),
    normalizeMemoryPath(path),
  ] as const,
  statScope: statScopeKey,
  stat: (nodeId: string, scope: 'global' | 'perThread', threadId: string | undefined, path: string) => [
    ...statScopeKey(nodeId, scope, threadId),
    normalizeMemoryPath(path),
  ] as const,
  readScope: readScopeKey,
  read: (nodeId: string, scope: 'global' | 'perThread', threadId: string | undefined, path: string) => [
    ...readScopeKey(nodeId, scope, threadId),
    normalizeMemoryPath(path),
  ] as const,
};

export type { MemoryDataApi };
