import { useEffect, useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import MemoryExplorerScreen from '../src/components/screens/MemoryExplorerScreen';
import { withMainLayout } from './decorators/withMainLayout';
import { memoryApi } from '../src/api/modules/memory';
import { memoryPathParent, normalizeMemoryPath } from '../src/components/memory/path';

type MemoryExplorerProps = React.ComponentProps<typeof MemoryExplorerScreen>;

type MemoryNode = {
  content: string;
  children: Set<string>;
};

type MemoryStore = Map<string, MemoryNode>;

const meta: Meta<typeof MemoryExplorerScreen> = {
  title: 'Screens/Memory Explorer',
  component: MemoryExplorerScreen,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof MemoryExplorerScreen>;
const createNode = (content: string = ''): MemoryNode => ({ content, children: new Set() });

const childName = (path: string): string => {
  const segments = path.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? '/';
};

const appendContent = (current: string, addition: string): string => {
  if (!current) return addition;
  if (!addition) return current;
  const needsSeparator = !current.endsWith('\n') && !addition.startsWith('\n');
  return needsSeparator ? `${current}\n${addition}` : `${current}${addition}`;
};

const normalizeForStore = (path: string): string => normalizeMemoryPath(path);

const ensureNode = (store: MemoryStore, rawPath: string): MemoryNode => {
  const path = normalizeForStore(rawPath);
  const existing = store.get(path);
  if (existing) return existing;
  const node = createNode();
  store.set(path, node);
  if (path !== '/') {
    const parent = memoryPathParent(path);
    const parentNode = ensureNode(store, parent);
    parentNode.children.add(path);
  }
  return node;
};

const removeNode = (store: MemoryStore, rawPath: string): number => {
  const path = normalizeForStore(rawPath);
  if (path === '/') return 0;
  const node = store.get(path);
  if (!node) return 0;
  let removed = 1;
  for (const child of Array.from(node.children)) {
    removed += removeNode(store, child);
  }
  store.delete(path);
  const parent = memoryPathParent(path);
  if (parent !== path) {
    const parentNode = store.get(parent);
    parentNode?.children.delete(path);
  }
  return removed;
};

const sortChildren = (paths: string[]): string[] =>
  [...paths].sort((a, b) => childName(a).localeCompare(childName(b), undefined, { sensitivity: 'base' }));

const seedStore = (): MemoryStore => {
  const store: MemoryStore = new Map();
  ensureNode(store, '/').content = '# Memory Explorer\n\nSelect any entry to edit its markdown.';

  ensureNode(store, '/projects').content = '## Projects overview\n- Alpha initiative\n- Beta expansions';
  ensureNode(store, '/projects/alpha').content = '### Alpha initiative\nFocus: retrieval quality and summarization fidelity.';
  ensureNode(store, '/projects/alpha/brief.md').content = '# Alpha brief\n\n- Capture user feedback\n- Draft evaluation rubric';
  ensureNode(store, '/projects/alpha/journal.md').content = '## Alpha journal\n\nDay 14 – iterated on explorer UI.';
  ensureNode(store, '/projects/beta').content = '### Beta experiments\nCoordinating integration test rollouts.';
  ensureNode(store, '/projects/beta/launch.md').content = '# Beta launch checklist\n1. Validate connectors\n2. Publish release notes';

  ensureNode(store, '/archives');
  ensureNode(store, '/archives/2023').content = 'Highlights from 2023 stored here.';
  ensureNode(store, '/archives/2023/summary.md').content = '# 2023 Summary\n- Memory explorer prototype shipped\n- Captured stakeholder feedback';

  ensureNode(store, '/notes.md').content = '# General notes\n- Align explorer UI with latest spec\n- Record learnings in markdown';

  return store;
};

let memoryStore: MemoryStore = seedStore();

const listEntries: typeof memoryApi.list = async (_nodeId, _scope, _threadId, rawPath) => {
  const path = normalizeForStore(rawPath);
  const node = memoryStore.get(path);
  if (!node) return { items: [] };
  const items = sortChildren(Array.from(node.children)).map((childPath) => {
    const child = memoryStore.get(childPath);
    return {
      name: childName(childPath),
      hasSubdocs: Boolean(child && child.children.size > 0),
    };
  });
  return { items };
};

const statPath: typeof memoryApi.stat = async (_nodeId, _scope, _threadId, rawPath) => {
  const path = normalizeForStore(rawPath);
  const node = memoryStore.get(path);
  if (!node) {
    return { exists: false, hasSubdocs: false, contentLength: 0 };
  }
  return {
    exists: true,
    hasSubdocs: node.children.size > 0,
    contentLength: node.content.length,
  };
};

const readPath: typeof memoryApi.read = async (_nodeId, _scope, _threadId, rawPath) => {
  const path = normalizeForStore(rawPath);
  const node = memoryStore.get(path);
  if (!node) {
    throw new Error('Document not found');
  }
  return { content: node.content };
};

const appendPath: typeof memoryApi.append = async (_nodeId, _scope, _threadId, rawPath, data) => {
  const path = normalizeForStore(rawPath);
  const node = ensureNode(memoryStore, path);
  node.content = appendContent(node.content, data);
};

const updatePath: typeof memoryApi.update = async (_nodeId, _scope, _threadId, rawPath, oldStr, newStr) => {
  const path = normalizeForStore(rawPath);
  const node = memoryStore.get(path);
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
};

const ensureDirPath: typeof memoryApi.ensureDir = async (_nodeId, _scope, _threadId, rawPath) => {
  ensureNode(memoryStore, rawPath);
};

const deletePath: typeof memoryApi.delete = async (_nodeId, _scope, _threadId, rawPath) => {
  const removed = removeNode(memoryStore, rawPath);
  return { removed };
};

const resetMemoryMock = () => {
  memoryStore = seedStore();
};

const installMemoryApiMock = () => {
  const originals = {
    list: memoryApi.list,
    stat: memoryApi.stat,
    read: memoryApi.read,
    append: memoryApi.append,
    update: memoryApi.update,
    ensureDir: memoryApi.ensureDir,
    delete: memoryApi.delete,
  };

  memoryApi.list = listEntries;
  memoryApi.stat = statPath;
  memoryApi.read = readPath;
  memoryApi.append = appendPath;
  memoryApi.update = updatePath;
  memoryApi.ensureDir = ensureDirPath;
  memoryApi.delete = deletePath;

  resetMemoryMock();

  return () => {
    memoryApi.list = originals.list;
    memoryApi.stat = originals.stat;
    memoryApi.read = originals.read;
    memoryApi.append = originals.append;
    memoryApi.update = originals.update;
    memoryApi.ensureDir = originals.ensureDir;
    memoryApi.delete = originals.delete;
  };
};

function MemoryExplorerStoryWrapper(props: MemoryExplorerProps) {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
        },
      }),
    [],
  );

  useEffect(() => {
    const restore = installMemoryApiMock();
    return () => {
      restore();
      queryClient.clear();
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <MemoryExplorerScreen {...props} />
    </QueryClientProvider>
  );
}

export const Default: Story = {
  args: {
    nodeId: 'demo-node',
    scope: 'global',
    initialPath: '/',
    onPathChange: (nextPath: string) => console.info('Path changed to', nextPath),
  },
  render: (args) => <MemoryExplorerStoryWrapper {...args} />,
};
