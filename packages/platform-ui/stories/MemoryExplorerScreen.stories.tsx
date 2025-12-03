import { useEffect, useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import MemoryExplorerScreen from '../src/components/screens/MemoryExplorerScreen';
import { withMainLayout } from './decorators/withMainLayout';
import {
  InMemoryMemoryProvider,
  type MemorySeedConfig,
} from '../src/components/memory/InMemoryMemoryProvider';

type MemoryExplorerProps = React.ComponentProps<typeof MemoryExplorerScreen>;

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

const storySeeds: MemorySeedConfig[] = [
  {
    nodeId: 'demo-node',
    scope: 'global',
    documents: [
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
    ],
  },
];

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
    return () => {
      queryClient.clear();
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <InMemoryMemoryProvider seeds={storySeeds}>
        <MemoryExplorerScreen {...props} />
      </InMemoryMemoryProvider>
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
