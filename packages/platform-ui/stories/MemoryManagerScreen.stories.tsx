import type { Meta, StoryObj } from '@storybook/react';
import { MemoryManager } from '@/components/screens/memoryManager/MemoryManager';
import type { MemoryTree } from '@/components/screens/memoryManager/utils';
import { withMainLayout } from './decorators/withMainLayout';

const tree: MemoryTree = {
  id: 'root',
  path: '/',
  name: 'alpha (global)',
  content: '# Alpha (global)\nShared announcements and notes.',
  children: [
    {
      id: '/glossary',
      path: '/glossary',
      name: 'glossary',
      content: 'Terms and definitions used by the org.',
      children: [
        {
          id: '/glossary/faq',
          path: '/glossary/faq',
          name: 'faq',
          content: 'Frequently asked questions and responses.',
          children: [],
        },
      ],
    },
    {
      id: '/launch-checklist',
      path: '/launch-checklist',
      name: 'launch-checklist',
      content: '- Prepare release notes\n- Notify stakeholders\n- Monitor metrics',
      children: [],
    },
  ],
};

const meta: Meta<typeof MemoryManager> = {
  title: 'Screens/MemoryManager',
  component: MemoryManager,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
    screen: {
      routePath: '/memory',
      initialEntry: '/memory',
    },
    selectedMenuItem: 'memory',
  },
  args: {
    nodes: [
      { key: 'alpha::global', label: 'alpha (global)' },
      { key: 'alpha::thread::ops-incident', label: 'alpha (thread: ops-incident)' },
    ],
    selectedNodeKey: 'alpha::global',
    onSelectNode: () => undefined,
    tree,
    treeLoading: false,
    disableInteractions: false,
    selectedPath: '/',
    onSelectPath: () => undefined,
    onCreateDirectory: () => undefined,
    onDeletePath: () => undefined,
    editorValue: tree.content,
    onEditorChange: () => undefined,
    canSave: true,
    onSave: () => undefined,
    isSaving: false,
    mutationError: null,
    docState: { loading: false, exists: true, error: null },
    showContentIndicators: true,
    emptyTreeMessage: 'No documents yet.',
    noNodesMessage: 'Add a memory node to begin.',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof MemoryManager>;

export const Default: Story = {};
