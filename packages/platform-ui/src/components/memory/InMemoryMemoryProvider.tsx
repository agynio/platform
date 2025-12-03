import { useEffect, useMemo, useRef, type ReactNode } from 'react';

import type { MemoryDocItem, ListEntry } from '@/api/modules/memory';

import { MemoryDataProvider, type MemoryDataApi } from './MemoryDataProvider';
import { memoryPathParent, normalizeMemoryPath } from './path';

type MemoryNode = {
  content: string;
  children: Set<string>;
};

type MemoryStore = Map<string, MemoryNode>;

export type MemorySeedDocument = {
  path: string;
  content?: string;
};

export type MemorySeedConfig = {
  nodeId: string;
  scope: 'global' | 'perThread';
  threadId?: string;
  documents?: MemorySeedDocument[];
};

export interface InMemoryMemoryProviderProps {
  children: ReactNode;
  seeds?: MemorySeedConfig[];
  nodes?: MemoryDocItem[];
}

const defaultSeedDocuments: MemorySeedDocument[] = [
  { path: '/', content: '# Memory Explorer\n\nSelect any entry to edit its markdown.' },
  { path: '/projects', content: '## Projects overview\n- Alpha initiative\n- Beta expansions' },
  {
    path: '/projects/alpha',
    content: '### Alpha initiative\nFocus: retrieval quality and summarization fidelity.',
  },
  {
    path: '/projects/alpha/brief.md',
    content: '# Alpha brief\n\n- Capture user feedback\n- Draft evaluation rubric',
  },
  {
    path: '/projects/alpha/journal.md',
    content: '## Alpha journal\n\nDay 14 – iterated on explorer UI.',
  },
  {
    path: '/projects/beta',
    content: '### Beta experiments\nCoordinating integration test rollouts.',
  },
  {
    path: '/projects/beta/launch.md',
    content: '# Beta launch checklist\n1. Validate connectors\n2. Publish release notes',
  },
  { path: '/archives', content: 'Archives for historical highlights.' },
  { path: '/archives/2023', content: 'Highlights from 2023 stored here.' },
  {
    path: '/archives/2023/summary.md',
    content: '# 2023 Summary\n- Memory explorer prototype shipped\n- Captured stakeholder feedback',
  },
  {
    path: '/notes.md',
    content: '# General notes\n- Align explorer UI with latest spec\n- Record learnings in markdown',
  },
];

const createStoreKey = (nodeId: string, scope: 'global' | 'perThread', threadId: string | undefined) =>
  `${nodeId}::${scope}::${threadId ?? ''}`;

const parseStoreKey = (key: string): { nodeId: string; scope: 'global' | 'perThread'; threadId?: string } => {
  const [nodeId, scopeRaw, threadRaw] = key.split('::');
  return {
    nodeId,
    scope: (scopeRaw as 'global' | 'perThread') ?? 'global',
    threadId: threadRaw ? threadRaw : undefined,
  };
};

const appendContent = (current: string, addition: string): string => {
  if (!current) return addition;
  if (!addition) return current;
  const needsSeparator = !current.endsWith('\n') && !addition.startsWith('\n');
  return needsSeparator ? `${current}\n${addition}` : `${current}${addition}`;
};

const defaultSeeds: MemorySeedConfig[] = [
  {
    nodeId: 'demo-node',
    scope: 'global',
    documents: defaultSeedDocuments,
  },
];

const defaultSeedMap = new Map(
  defaultSeeds.map((seed) => [createStoreKey(seed.nodeId, seed.scope, seed.threadId), seed.documents ?? []]),
);

const ensureNode = (store: MemoryStore, rawPath: string): MemoryNode => {
  const path = normalizeMemoryPath(rawPath);
  const existing = store.get(path);
  if (existing) return existing;
  const node: MemoryNode = { content: '', children: new Set() };
  store.set(path, node);
  if (path !== '/') {
    const parent = memoryPathParent(path);
    const parentNode = ensureNode(store, parent);
    parentNode.children.add(path);
  }
  return node;
};

const removeNode = (store: MemoryStore, rawPath: string): number => {
  const path = normalizeMemoryPath(rawPath);
  if (path === '/') return 0;
  const node = store.get(path);
  if (!node) return 0;
  let removed = 1;
  for (const child of Array.from(node.children)) {
    removed += removeNode(store, child);
  }
  store.delete(path);
  const parent = memoryPathParent(path);
  const parentNode = store.get(parent);
  parentNode?.children.delete(path);
  return removed;
};

const seedStore = (seedDocs: MemorySeedDocument[]): MemoryStore => {
  const store: MemoryStore = new Map();
  ensureNode(store, '/');
  for (const doc of seedDocs) {
    const node = ensureNode(store, doc.path);
    if (typeof doc.content === 'string') {
      node.content = doc.content;
    }
  }
  return store;
};

const childName = (path: string) => {
  const segments = path.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? '/';
};

const sortChildren = (paths: string[], store: MemoryStore): string[] => {
  return [...paths].sort((a, b) => {
    const aNode = store.get(a);
    const bNode = store.get(b);
    const aIsDir = Boolean(aNode && aNode.children.size > 0);
    const bIsDir = Boolean(bNode && bNode.children.size > 0);
    if (aIsDir !== bIsDir) {
      return aIsDir ? -1 : 1;
    }
    return childName(a).localeCompare(childName(b), undefined, { sensitivity: 'base' });
  });
};

export function InMemoryMemoryProvider({ children, seeds = defaultSeeds, nodes }: InMemoryMemoryProviderProps) {
  const seedsMap = useMemo(() => {
    const map = new Map<string, MemorySeedDocument[]>();
    for (const seed of seeds) {
      const key = createStoreKey(seed.nodeId, seed.scope, seed.threadId);
      map.set(key, seed.documents ?? []);
    }
    return map;
  }, [seeds]);

  const storesRef = useRef<Map<string, MemoryStore>>(new Map());
  const seedsRef = useRef(seedsMap);
  const docItemsRef = useRef<MemoryDocItem[]>([]);

  const derivedDocItems = useMemo(() => {
    if (nodes && nodes.length > 0) {
      return nodes;
    }
    const items: MemoryDocItem[] = [];
    for (const key of seedsMap.keys()) {
      const { nodeId, scope, threadId } = parseStoreKey(key);
      items.push({ nodeId, scope, threadId });
    }
    return items;
  }, [nodes, seedsMap]);

  docItemsRef.current = derivedDocItems;

  const resetAllStores = () => {
    const next = new Map<string, MemoryStore>();
    const keys = new Set([...seedsRef.current.keys()]);
    if (keys.size === 0) {
      for (const seed of defaultSeeds) {
        keys.add(createStoreKey(seed.nodeId, seed.scope, seed.threadId));
      }
    }
    for (const key of keys) {
      const seedDocs = seedsRef.current.get(key) ?? defaultSeedMap.get(key) ?? [];
      next.set(key, seedStore(seedDocs));
    }
    storesRef.current = next;
  };

  useEffect(() => {
    seedsRef.current = seedsMap;
    resetAllStores();
  }, [seedsMap]);

  useEffect(() => {
    return () => {
      storesRef.current.clear();
    };
  }, []);

  const apiRef = useRef<MemoryDataApi | null>(null);

  if (!apiRef.current) {
    const getStore = (nodeId: string, scope: 'global' | 'perThread', threadId: string | undefined): MemoryStore => {
      const key = createStoreKey(nodeId, scope, threadId);
      let store = storesRef.current.get(key);
      if (!store) {
        const seedDocs = seedsRef.current.get(key) ?? [];
        store = seedStore(seedDocs);
        storesRef.current.set(key, store);
      }
      return store;
    };

    apiRef.current = {
      async listDocs() {
        return { items: [...docItemsRef.current] };
      },
      async list(nodeId, scope, threadId, rawPath) {
        const store = getStore(nodeId, scope, threadId);
        const path = normalizeMemoryPath(rawPath);
        const node = store.get(path);
        if (!node) return { items: [] };
        const sortedChildren = sortChildren(Array.from(node.children), store);
        const items: ListEntry[] = sortedChildren.map((childPath) => {
          const child = store.get(childPath);
          const name = childPath.split('/').filter(Boolean).pop() ?? '/';
          return {
            name,
            hasSubdocs: Boolean(child?.children.size),
          };
        });
        return { items };
      },
      async stat(nodeId, scope, threadId, rawPath) {
        const store = getStore(nodeId, scope, threadId);
        const path = normalizeMemoryPath(rawPath);
        const node = store.get(path);
        if (!node) {
          return { exists: false, hasSubdocs: false, contentLength: 0 };
        }
        return {
          exists: true,
          hasSubdocs: node.children.size > 0,
          contentLength: node.content.length,
        };
      },
      async read(nodeId, scope, threadId, rawPath) {
        const store = getStore(nodeId, scope, threadId);
        const path = normalizeMemoryPath(rawPath);
        const node = store.get(path);
        if (!node) {
          throw new Error('Document not found');
        }
        return { content: node.content };
      },
      async append(nodeId, scope, threadId, rawPath, data) {
        const store = getStore(nodeId, scope, threadId);
        const node = ensureNode(store, rawPath);
        node.content = appendContent(node.content, data);
      },
      async update(nodeId, scope, threadId, rawPath, oldStr, newStr) {
        const store = getStore(nodeId, scope, threadId);
        const path = normalizeMemoryPath(rawPath);
        const node = store.get(path);
        if (!node) {
          throw new Error('ENOENT');
        }
        if (oldStr.length === 0) {
          return { replaced: 0 };
        }
        const segments = node.content.split(oldStr);
        const count = segments.length - 1;
        if (count === 0) {
          return { replaced: 0 };
        }
        node.content = segments.join(newStr);
        return { replaced: count };
      },
      async ensureDir(nodeId, scope, threadId, rawPath) {
        const store = getStore(nodeId, scope, threadId);
        ensureNode(store, rawPath);
      },
      async delete(nodeId, scope, threadId, rawPath) {
        const store = getStore(nodeId, scope, threadId);
        const removed = removeNode(store, rawPath);
        return { removed };
      },
      async dump(nodeId, scope, threadId) {
        const store = getStore(nodeId, scope, threadId);
        return Array.from(store.entries()).map(([path, node]) => ({
          path,
          content: node.content,
          children: Array.from(node.children),
        }));
      },
    } satisfies MemoryDataApi;
  }

  const api = apiRef.current;

  return <MemoryDataProvider api={api!}>{children}</MemoryDataProvider>;
}
