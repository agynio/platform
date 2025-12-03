import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { MemoryManager } from '../src/components/memoryManager/MemoryManager';
import type { MemoryTree } from '../src/components/memoryManager/utils';
import { cloneTree } from '../src/components/memoryManager/utils';

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
    <div className="h-[640px] w-full rounded-xl border border-sidebar-border bg-sidebar p-6 text-sidebar-foreground">
      <div className="flex h-full flex-col gap-4">
        <MemoryManager
          initialTree={tree}
          initialSelectedPath={selectedPath}
          showContentIndicators={args.showContentIndicators ?? true}
          onTreeChange={(nextTree) => setTree(cloneTree(nextTree))}
          onSelectPath={(path) => setSelectedPath(path)}
        />
        <div className="rounded-md border border-sidebar-border/60 bg-background/80 p-3 text-xs text-muted-foreground dark:text-muted-foreground/90">
          Tip: Use arrow keys to move between documents and notice the design-system highlight tracking the selected tree row.
        </div>
      </div>
    </div>
  );
};

export const InteractivePlayground: Story = {
  render: (args) => <InteractiveTemplate {...args} />,
};
