export type ThreadStatus = 'open' | 'closed';

export type ThreadNode = {
  id: string;
  alias: string;
  summary?: string | null;
  status?: ThreadStatus;
  parentId?: string | null;
  createdAt: string;
};

export type RunMeta = {
  id: string;
  threadId: string;
  createdAt: string;
  updatedAt: string;
};

export type RunMessageItem = { id: string; kind: 'user' | 'assistant' | 'system' | 'tool'; text?: string | null; source: unknown; createdAt: string };

