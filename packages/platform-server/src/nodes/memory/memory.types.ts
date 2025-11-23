export type MemoryScope = 'global' | 'perThread';

export type MemoryFilter = { nodeId: string; threadId: string | null };

export interface MemoryEntity {
  id: string;
  nodeId: string;
  threadId: string | null;
  parentId: string | null;
  name: string;
  content: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MemoryEntityWithChildren extends MemoryEntity {
  hasChildren: boolean;
}

export interface StatResult {
  exists: boolean;
  hasSubdocs: boolean;
  contentLength: number;
}

export interface ListEntry {
  name: string;
  hasSubdocs: boolean;
}

export interface DeleteResult {
  removed: number;
}
