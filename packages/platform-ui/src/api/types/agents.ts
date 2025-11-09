export type ThreadStatus = 'open' | 'closed';

export type ThreadMetrics = {
  remindersCount: number;
  activity: 'working' | 'waiting' | 'idle';
};

export type ThreadNode = {
  id: string;
  alias: string;
  summary?: string | null;
  status?: ThreadStatus;
  parentId?: string | null;
  createdAt: string;
  metrics?: ThreadMetrics;
};

export type RunMeta = {
  id: string;
  threadId: string;
  createdAt: string;
  updatedAt: string;
};

export type RunMessageItem = { id: string; kind: 'user' | 'assistant' | 'system' | 'tool'; text?: string | null; source: unknown; createdAt: string };
