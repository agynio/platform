import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThreadTreeNode } from '../ThreadTreeNode';
import type { ThreadNode } from '@/api/types/agents';

vi.mock('@/api/modules/threads', () => ({
  threads: {
    children: vi.fn().mockResolvedValue({ items: [] }),
    patchStatus: vi.fn().mockResolvedValue(undefined),
  },
}));

const baseNode: ThreadNode = {
  id: 'thread-1',
  alias: 'thread-1',
  summary: 'Root summary',
  status: 'open',
  parentId: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 },
  agentTitle: 'Agent Alpha',
};

function renderNode(node: ThreadNode) {
  return render(
    <ul>
      <ThreadTreeNode node={node} statusFilter="all" level={0} onSelect={() => {}} />
    </ul>,
  );
}

describe('ThreadTreeNode', () => {
  it('shows Close/Reopen toggle only for root threads', () => {
    renderNode(baseNode);
    expect(screen.getByRole('button', { name: 'Close thread' })).toBeInTheDocument();
  });

  it('hides Close/Reopen toggle for child threads', () => {
    renderNode({ ...baseNode, id: 'thread-2', parentId: baseNode.id });
    expect(screen.queryByRole('button', { name: /Close thread|Reopen thread/ })).toBeNull();
  });
});
