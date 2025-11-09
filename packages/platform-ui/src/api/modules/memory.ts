import { http } from '../http';
import { asData } from '../asData';

export type MemoryDocItem = { nodeId: string; scope: 'global'|'perThread'; threadId?: string };
export type ListEntry = { name: string; kind: 'file'|'dir' };

export const memoryApi = {
  listDocs: () => asData<{ items: MemoryDocItem[] }>(http.get<{ items: MemoryDocItem[] }>(`/api/memory/docs`)),
  list: (nodeId: string, scope: 'global'|'perThread', threadId: string | undefined, path: string) => asData<{ items: ListEntry[] }>(http.get(`/api/memory/${encodeURIComponent(nodeId)}/${encodeURIComponent(scope)}/list`, { params: { path, threadId } })),
  stat: (nodeId: string, scope: 'global'|'perThread', threadId: string | undefined, path: string) => asData<{ kind: 'file'|'dir'|'none'; size?: number }>(http.get(`/api/memory/${encodeURIComponent(nodeId)}/${encodeURIComponent(scope)}/stat`, { params: { path, threadId } })),
  read: (nodeId: string, scope: 'global'|'perThread', threadId: string | undefined, path: string) => asData<{ content: string }>(http.get(`/api/memory/${encodeURIComponent(nodeId)}/${encodeURIComponent(scope)}/read`, { params: { path, threadId } })),
  append: (nodeId: string, scope: 'global'|'perThread', threadId: string | undefined, path: string, data: string) => asData<void>(http.post(`/api/memory/${encodeURIComponent(nodeId)}/${encodeURIComponent(scope)}/append`, { path, data, threadId })),
  update: (nodeId: string, scope: 'global'|'perThread', threadId: string | undefined, path: string, oldStr: string, newStr: string) => asData<{ replaced: number }>(http.post(`/api/memory/${encodeURIComponent(nodeId)}/${encodeURIComponent(scope)}/update`, { path, oldStr, newStr, threadId })),
  ensureDir: (nodeId: string, scope: 'global'|'perThread', threadId: string | undefined, path: string) => asData<void>(http.post(`/api/memory/${encodeURIComponent(nodeId)}/${encodeURIComponent(scope)}/ensure-dir`, { path, threadId })),
  delete: (nodeId: string, scope: 'global'|'perThread', threadId: string | undefined, path: string) => asData<{ files: number; dirs: number }>(http.delete(`/api/memory/${encodeURIComponent(nodeId)}/${encodeURIComponent(scope)}`, { params: { path, threadId } })),
  dump: (nodeId: string, scope: 'global'|'perThread', threadId: string | undefined) => asData(http.get(`/api/memory/${encodeURIComponent(nodeId)}/${encodeURIComponent(scope)}/dump`, { params: { threadId } })),
};

