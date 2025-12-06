import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  agentName: 'Agent Alpha',
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

  it('renders chevron toggle with accessible label and rotates on expand', async () => {
    const user = userEvent.setup();
    renderNode(baseNode);

    const treeItem = screen.getByRole('treeitem');
    expect(treeItem).toHaveAttribute('aria-expanded', 'false');

    const toggle = screen.getByRole('button', { name: 'Expand' });
    const icon = toggle.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveClass('-rotate-90');
    expect(toggle).not.toHaveAttribute('aria-controls');

    await user.click(toggle);

    expect(treeItem).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-label', 'Collapse');
    expect(toggle).toHaveAttribute('aria-controls', 'thread-children-thread-1');
    const updatedIcon = toggle.querySelector('svg');
    expect(updatedIcon).not.toBeNull();
    expect(updatedIcon).toHaveClass('rotate-0');
  });
});
