export type MemoryScope = 'global' | 'perThread';

export type MemoryFilter = { nodeId: string; scope: MemoryScope; threadId?: string };
export type MemoryDataMap = Record<string, string | Record<string, unknown>>;
export type MemoryDirsMap = Record<string, true | Record<string, unknown>>;

export interface MemoryDoc {
  nodeId: string;
  scope: MemoryScope;
  threadId?: string;
  data: MemoryDataMap;
  dirs: MemoryDirsMap;
}

export interface StatResult {
  kind: 'file' | 'dir' | 'none';
  size?: number;
}

export interface ListEntry {
  name: string;
  kind: 'file' | 'dir';
}

