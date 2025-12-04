import { useEffect, useState } from 'react';
import { userEvent, waitForElementToBeRemoved, within } from '@storybook/testing-library';
import type { Meta, StoryObj } from '@storybook/react';

import { MemoryManager } from '../src/components/memoryManager/MemoryManager';
import type { MemoryTree } from '../src/components/memoryManager/utils';
import { cloneTree } from '../src/components/memoryManager/utils';
import { withMainLayout } from './decorators/withMainLayout';

const populatedTree: MemoryTree = {
  id: 'root',
  path: '/',
  name: 'All memory cells',
  content: '# Memory overview\n\nUse the Memory Manager to explore shared knowledge.',
  children: [
    {
      id: 'global-memory',
      path: '/global-memory',
      name: 'Global memory',
      content: '# Global memory\n\nCompany-wide announcements and shared norms.',
      children: [
        {
          id: 'global-announcements',
          path: '/global-memory/announcements',
          name: 'Announcements',
          content: 'Upcoming launch timelines and safety updates.',
          children: [],
        },
        {
          id: 'global-guidelines',
          path: '/global-memory/guidelines',
          name: 'Guidelines',
          content: 'Security, compliance, and operating procedures.',
          children: [],
        },
      ],
    },
    {
      id: 'project-memory',
      path: '/project-memory',
      name: 'Project memory',
      content: '# Project memory\n\nCapture customer insights and delivery milestones.',
      children: [
        {
          id: 'project-overview',
          path: '/project-memory/overview',
          name: 'Overview',
          content: 'Goals, scope, and timelines for the active initiative.',
          children: [],
        },
        {
          id: 'project-resources',
          path: '/project-memory/resources',
          name: 'Resources',
          content: 'Links to research folders, briefs, and design assets.',
          children: [],
        },
      ],
    },
    {
      id: 'best-practices-memory',
      path: '/best-practices-memory',
      name: 'Best practices memory',
      content: '# Best practices\n\nReusable checklists and recommended flows.',
      children: [
        {
          id: 'best-checklists',
          path: '/best-practices-memory/checklists',
          name: 'Checklists',
          content: 'Delivery QA, security sign-off, and release rollbacks.',
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
    initialSelectedPath: '/project-memory/resources',
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
          'Use the Memory cell selector under the Documents header to scope the tree, then use the add icon on any tree node to open the subdocument dialog and the document header delete action to preview the destructive confirmation and design-system buttons.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nodeSelector = await canvas.findByRole('combobox', { name: /memory cell/i });
    await userEvent.click(nodeSelector);
    const portal = within(canvasElement.ownerDocument.body);
    const projectOption = await portal.findByRole('option', { name: /^Project memory$/i });
    await userEvent.click(projectOption);
    await canvas.findByText('Viewing Project memory');
    const addButton = await canvas.findByRole('button', { name: /Add subdocument/i });
    await userEvent.click(addButton);
    const nameField = await canvas.findByLabelText(/name/i);
    await userEvent.clear(nameField);
    await userEvent.type(nameField, 'new-subdocument');
    const createButton = await canvas.findByRole('button', { name: /^create$/i });
    await userEvent.click(createButton);
    await canvas.findByText('new-subdocument');

    const newNode = await canvas.findByRole('treeitem', { name: /new-subdocument/i });
    await userEvent.click(newNode);
    const deleteButton = await canvas.findByRole('button', { name: /delete document/i });
    await userEvent.click(deleteButton);
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: /delete memory node/i });
    await within(dialog).findByRole('button', { name: /^cancel$/i });
    await within(dialog).findByRole('button', { name: /^delete$/i });
    await userEvent.click(within(dialog).getByRole('button', { name: /^cancel$/i }));
    await waitForElementToBeRemoved(() => within(canvasElement.ownerDocument.body).queryByRole('dialog', { name: /delete memory node/i }));
  },
};
