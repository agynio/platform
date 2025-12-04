import { useEffect, useState } from 'react';
import { userEvent, within } from '@storybook/testing-library';
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
    <div className="h-[720px]">
      <MemoryManager
        className="h-full"
        initialTree={tree}
        initialSelectedPath={selectedPath}
        showContentIndicators={args.showContentIndicators ?? true}
        onTreeChange={(nextTree) => setTree(cloneTree(nextTree))}
        onSelectPath={(path) => setSelectedPath(path)}
      />
    </div>
  );
};

export const InteractivePlayground: Story = {
  render: (args) => <InteractiveTemplate {...args} />,
  parameters: {
    docs: {
      description: {
        story:
          'Use the Memory node selector above the tree to scope the view, then use the add icon on any tree node to open the subdocument dialog and the document header delete action to preview the destructive confirmation.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nodeSelector = await canvas.findByLabelText(/memory node/i);
    await userEvent.click(nodeSelector);
    const portal = within(canvasElement.ownerDocument.body);
    const notesOption = await portal.findByRole('option', { name: /^notes \(\/notes\)$/i });
    await userEvent.click(notesOption);
    await canvas.findByText('Viewing /notes');
    const addButton = await canvas.findByRole('button', { name: /Add subdocument/i });
    await userEvent.click(addButton);
    const nameField = await canvas.findByLabelText(/name/i);
    await userEvent.clear(nameField);
    await userEvent.type(nameField, 'new-subdocument');
    const createButton = await canvas.findByRole('button', { name: /^create$/i });
    await userEvent.click(createButton);
    await canvas.findByText('new-subdocument');
  },
};
