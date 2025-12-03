import { useEffect, useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { MemoryManager } from '../src/components/memoryManager/MemoryManager';
import type { MemoryTree } from '../src/components/memoryManager/utils';
import { cloneTree } from '../src/components/memoryManager/utils';

const populatedTree: MemoryTree = {
  id: 'root',
  path: '/',
  name: '/',
  hasDocument: false,
  content: '',
  children: [
    {
      id: 'notes',
      path: '/notes',
      name: 'notes',
      hasDocument: false,
      content: '',
      children: [
        {
          id: 'notes-todo',
          path: '/notes/todo',
          name: 'todo',
          hasDocument: true,
          content: '# Todo list\n\n- Draft onboarding email\n- Schedule memory sync',
          children: [],
        },
      ],
    },
    {
      id: 'guides',
      path: '/guides',
      name: 'guides',
      hasDocument: true,
      content: 'Guides index',
      children: [
        {
          id: 'guides-getting-started',
          path: '/guides/getting-started',
          name: 'getting-started',
          hasDocument: true,
          content: `# Getting Started\n\n1. Install dependencies\n2. Launch Storybook\n3. Explore the Memory Manager UI`,
          children: [],
        },
      ],
    },
  ],
};

type MemoryManagerStoryArgs = {
  initialTree: MemoryTree;
  initialSelectedPath?: string;
  showContentIndicators?: boolean;
};

const meta: Meta<typeof MemoryManager> = {
  title: 'Memory/MemoryManager',
  component: MemoryManager,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    initialTree: {
      control: 'object',
    },
    initialSelectedPath: {
      control: 'text',
    },
    showContentIndicators: {
      control: 'boolean',
    },
  },
  args: {
    initialTree: cloneTree(populatedTree),
    initialSelectedPath: '/guides/getting-started',
    showContentIndicators: true,
  } satisfies MemoryManagerStoryArgs,
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof meta>;

const InteractiveTemplate = (args: MemoryManagerStoryArgs) => {
  const [tree, setTree] = useState<MemoryTree>(() => cloneTree(args.initialTree));
  const [selectedPath, setSelectedPath] = useState<string>(() => args.initialSelectedPath ?? args.initialTree.path);
  const [editorValue, setEditorValue] = useState<string>('');

  useEffect(() => {
    setTree(cloneTree(args.initialTree));
    if (!args.initialSelectedPath) {
      setSelectedPath(args.initialTree.path);
    }
  }, [args.initialSelectedPath, args.initialTree]);

  useEffect(() => {
    if (args.initialSelectedPath) {
      setSelectedPath(args.initialSelectedPath);
    }
  }, [args.initialSelectedPath]);

  const nodeCount = useMemo(() => countNodes(tree), [tree]);

  return (
    <div className="h-[640px] w-full bg-muted/10 p-4">
      <div className="flex h-full flex-col gap-4 xl:flex-row">
        <div className="flex-1">
          <MemoryManager
            initialTree={tree}
            initialSelectedPath={selectedPath}
            showContentIndicators={args.showContentIndicators ?? true}
            onTreeChange={(nextTree) => setTree(cloneTree(nextTree))}
            onSelectPath={(path) => setSelectedPath(path)}
            onEditorChange={(value) => setEditorValue(value)}
          />
        </div>
        <aside className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground xl:w-72 xl:shrink-0">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Story state</h3>
          <dl className="space-y-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground/80">Selected path</dt>
              <dd className="break-words text-foreground">{selectedPath}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground/80">Content length</dt>
              <dd className="text-foreground">{editorValue.length} characters</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground/80">Tree nodes</dt>
              <dd className="text-foreground">{nodeCount}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-relaxed">
            Use the Memory Manager to add or remove nodes, edit markdown, and press Save to persist your changes in this story.
          </p>
        </aside>
      </div>
    </div>
  );
};

export const InteractivePlayground: Story = {
  render: (args) => <InteractiveTemplate {...args} />,
};

function countNodes(tree: MemoryTree): number {
  return tree.children.reduce((total, child) => total + countNodes(child), 1);
}
