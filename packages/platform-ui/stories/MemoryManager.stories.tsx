import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { MemoryManager } from '../src/components/memoryManager/MemoryManager';
import type { MemoryTree } from '../src/components/memoryManager/utils';
import { cloneTree } from '../src/components/memoryManager/utils';
import { withMainLayout } from './decorators/withMainLayout';

const populatedTree: MemoryTree = {
  id: 'root',
  path: '/',
  name: '/',
  content: '# Workspace overview\n\nUse the Memory Manager to create nested documents.',
  children: [
    {
      id: 'notes',
      path: '/notes',
      name: 'notes',
      content: 'Notes index',
      children: [
        {
          id: 'notes-todo',
          path: '/notes/todo',
          name: 'todo',
          content: '# Todo list\n\n- Draft onboarding email\n- Schedule memory sync',
          children: [],
        },
      ],
    },
    {
      id: 'guides',
      path: '/guides',
      name: 'guides',
      content: 'Guides index',
      children: [
        {
          id: 'guides-getting-started',
          path: '/guides/getting-started',
          name: 'getting-started',
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
  title: 'Screens/MemoryManager',
  component: MemoryManager,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
    selectedMenuItem: 'graph',
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

  return (
    <div className="flex h-full min-h-[640px] w-full flex-col gap-4 bg-[var(--agyn-bg-light)] p-6">
      <div className="flex-1 rounded-[16px] border border-[var(--agyn-border-subtle)] bg-white p-4">
        <MemoryManager
          className="h-full"
          initialTree={tree}
          initialSelectedPath={selectedPath}
          showContentIndicators={args.showContentIndicators ?? true}
          onTreeChange={(nextTree) => setTree(cloneTree(nextTree))}
          onSelectPath={(path) => setSelectedPath(path)}
        />
      </div>
      <div className="rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white px-4 py-3 text-xs text-[var(--agyn-gray)]">
        Tip: Navigate with ↑/↓ to move between documents and press ⌘/Ctrl + S to save changes instantly.
      </div>
    </div>
  );
};

export const InteractivePlayground: Story = {
  render: (args) => <InteractiveTemplate {...args} />,
};
